CREATE TABLE public.delivery_nonces (
  nonce text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.delivery_nonces TO service_role;
ALTER TABLE public.delivery_nonces ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.delivery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id),
  try_number integer NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','completed')),
  lease_until timestamptz NOT NULL,
  file_path text,
  file_name text,
  actor text NOT NULL,
  source text NOT NULL,
  claimed_actor text,
  attempts integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (job_id, try_number)
);
GRANT SELECT ON public.delivery_requests TO authenticated;
GRANT ALL ON public.delivery_requests TO service_role;
ALTER TABLE public.delivery_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delivery requests admin read" ON public.delivery_requests FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE public.delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  try_number integer,
  content_sha256 text,
  size_bytes bigint,
  actor text NOT NULL,
  source text NOT NULL,
  outcome text NOT NULL,
  http_status integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.delivery_log TO authenticated;
GRANT ALL ON public.delivery_log TO service_role;
ALTER TABLE public.delivery_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delivery log admin read" ON public.delivery_log FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id),
  try_number integer NOT NULL,
  template text NOT NULL,
  user_id uuid NOT NULL,
  lang text NOT NULL DEFAULT 'en',
  status text NOT NULL CHECK (status IN ('queued','blocked','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, try_number, template)
);
GRANT SELECT ON public.email_outbox TO authenticated;
GRANT ALL ON public.email_outbox TO service_role;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email outbox admin read" ON public.email_outbox FOR SELECT TO authenticated USING (public.is_admin());

-- Replay protection: returns false when the nonce was already used.
CREATE OR REPLACE FUNCTION public.claim_delivery_nonce(_nonce text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare n int;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  delete from public.delivery_nonces where created_at < now() - interval '1 day';
  insert into public.delivery_nonces(nonce) values (_nonce) on conflict do nothing;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- Atomic reservation (lease) per job+try with content hash.
CREATE OR REPLACE FUNCTION public.reserve_delivery(_job_id uuid, _try_number integer, _sha text, _size bigint, _actor text, _source text, _claimed_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare j record; r record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  select id, status, try_number into j from public.jobs where id = _job_id for update;
  if not found then return jsonb_build_object('result','not_found'); end if;
  if _try_number < j.try_number then return jsonb_build_object('result','conflict_older_attempt'); end if;
  if _try_number > j.try_number then return jsonb_build_object('result','attempt_mismatch'); end if;
  select * into r from public.delivery_requests where job_id = _job_id and try_number = _try_number for update;
  if found then
    if r.content_sha256 <> _sha then return jsonb_build_object('result','conflict_different_bytes','request_id',r.id); end if;
    if r.state = 'completed' then return jsonb_build_object('result','already_completed','request_id',r.id,'file_path',r.file_path); end if;
    if r.lease_until > now() then return jsonb_build_object('result','in_progress','request_id',r.id); end if;
    update public.delivery_requests set lease_until = now() + interval '5 minutes', attempts = attempts + 1 where id = r.id;
    return jsonb_build_object('result','reserved','request_id',r.id);
  end if;
  if j.status = 'cancelled' then return jsonb_build_object('result','conflict_cancelled'); end if;
  -- Delivered without a matching delivery request (e.g. legacy callback deliveries) is never touched.
  if j.status = 'delivered' then return jsonb_build_object('result','conflict_already_delivered'); end if;
  insert into public.delivery_requests(job_id, try_number, content_sha256, size_bytes, lease_until, actor, source, claimed_actor)
    values (_job_id, _try_number, _sha, _size, now() + interval '5 minutes', _actor, _source, _claimed_actor) returning id into r.id;
  return jsonb_build_object('result','reserved','request_id',r.id);
end $$;

-- Completes after the durable file exists: deliverable + Delivered status + email outbox, atomically.
CREATE OR REPLACE FUNCTION public.complete_delivery(_request_id uuid, _file_path text, _file_name text, _email_status text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare r record; j record; lang text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  if _email_status not in ('queued','blocked') then raise exception 'bad email status'; end if;
  select * into r from public.delivery_requests where id = _request_id for update;
  if not found then return 'not_found'; end if;
  select id, status, try_number, user_id into j from public.jobs where id = r.job_id for update;
  if r.state = 'completed' then return 'already_completed'; end if;
  if j.try_number <> r.try_number then return 'attempt_mismatch'; end if;
  if j.status in ('delivered','cancelled') then return 'conflict_terminal'; end if;
  insert into public.deliverables(job_id, file_path, file_name, try_number) values (r.job_id, _file_path, _file_name, r.try_number);
  perform set_config('app.status_message', 'Final video delivered', true);
  update public.jobs set status = 'delivered' where id = r.job_id;
  perform set_config('app.status_message', '', true);
  update public.delivery_requests set state = 'completed', file_path = _file_path, file_name = _file_name, completed_at = now() where id = _request_id;
  insert into public.spoofer_sync_log(job_id, direction, event, ok, event_id, message)
    values (r.job_id, 'inbound', 'delivery:completed', true, 'delivery:' || _request_id::text, 'sha256 ' || r.content_sha256);
  update public.spoofer_sync set remote_status = 'delivered', updated_at = now() where job_id = r.job_id;
  select coalesce(nullif(p.preferred_language,''),'en') into lang from public.profiles p where p.id = j.user_id;
  insert into public.email_outbox(job_id, try_number, template, user_id, lang, status, last_error)
    values (r.job_id, r.try_number, 'video-ready', j.user_id, coalesce(lang,'en'), _email_status,
      case when _email_status = 'blocked' then 'email_domain_not_configured' end)
    on conflict (job_id, try_number, template) do nothing;
  return 'completed';
end $$;

REVOKE EXECUTE ON FUNCTION public.claim_delivery_nonce(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_delivery(uuid, integer, text, bigint, text, text, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_delivery(uuid, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_delivery_nonce(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_delivery(uuid, integer, text, bigint, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid, text, text, text) TO service_role;