ALTER TABLE public.delivery_requests ADD COLUMN lease_token uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.email_outbox ADD COLUMN lease_token uuid;
ALTER TABLE public.email_outbox ADD COLUMN lease_until timestamptz;
ALTER TABLE public.email_outbox ADD COLUMN idempotency_key text;
ALTER TABLE public.email_outbox ADD COLUMN sent_at timestamptz;
UPDATE public.email_outbox SET idempotency_key = template || '-' || job_id::text || '-try' || try_number WHERE idempotency_key IS NULL;
CREATE UNIQUE INDEX email_outbox_idem_key ON public.email_outbox(idempotency_key);
ALTER TABLE public.email_outbox DROP CONSTRAINT email_outbox_status_check;
ALTER TABLE public.email_outbox ADD CONSTRAINT email_outbox_status_check CHECK (status IN ('queued','sending','blocked','sent','failed'));

DROP FUNCTION public.reserve_delivery(uuid, integer, text, bigint, text, text, text);
DROP FUNCTION public.complete_delivery(uuid, text, text, text);

-- Lock order everywhere: jobs row first, then delivery_requests row.
CREATE FUNCTION public.reserve_delivery(_job_id uuid, _try_number integer, _sha text, _size bigint, _actor text, _source text, _claimed_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare j record; r record; tok uuid := gen_random_uuid(); rid uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  if _size is null or _size <= 0 then raise exception 'size required'; end if;
  select id, status, try_number into j from public.jobs where id = _job_id for update;
  if not found then return jsonb_build_object('result','not_found'); end if;
  if _try_number < j.try_number then return jsonb_build_object('result','conflict_older_attempt'); end if;
  if _try_number > j.try_number then return jsonb_build_object('result','attempt_mismatch'); end if;
  select * into r from public.delivery_requests where job_id = _job_id and try_number = _try_number for update;
  if found then
    if r.content_sha256 <> _sha or r.size_bytes <> _size then return jsonb_build_object('result','conflict_different_bytes','request_id',r.id); end if;
    if r.state = 'completed' then return jsonb_build_object('result','already_completed','request_id',r.id); end if;
    if j.status in ('delivered','cancelled') then return jsonb_build_object('result','conflict_terminal','request_id',r.id); end if;
    if r.lease_until > now() then return jsonb_build_object('result','in_progress','request_id',r.id); end if;
    update public.delivery_requests set lease_until = now() + interval '5 minutes', lease_token = tok, attempts = attempts + 1 where id = r.id;
    return jsonb_build_object('result','reserved','request_id',r.id,'lease_token',tok);
  end if;
  if j.status = 'cancelled' then return jsonb_build_object('result','conflict_cancelled'); end if;
  if j.status = 'delivered' then return jsonb_build_object('result','conflict_already_delivered'); end if;
  insert into public.delivery_requests(job_id, try_number, content_sha256, size_bytes, lease_until, lease_token, actor, source, claimed_actor)
    values (_job_id, _try_number, _sha, _size, now() + interval '5 minutes', tok, _actor, _source, _claimed_actor) returning id into rid;
  return jsonb_build_object('result','reserved','request_id',rid,'lease_token',tok);
end $$;

CREATE FUNCTION public.complete_delivery(_request_id uuid, _lease_token uuid, _sha text, _size bigint, _file_path text, _file_name text, _email_status text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare jid uuid; r record; j record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  if _email_status not in ('queued','blocked') then raise exception 'bad email status'; end if;
  select job_id into jid from public.delivery_requests where id = _request_id;
  if not found then return 'not_found'; end if;
  select id, status, try_number, user_id into j from public.jobs where id = jid for update;
  select * into r from public.delivery_requests where id = _request_id for update;
  if r.state = 'completed' then return 'already_completed'; end if;
  if r.lease_token <> _lease_token then return 'lease_lost'; end if;
  if r.lease_until <= now() then return 'lease_expired'; end if;
  if r.content_sha256 <> _sha or r.size_bytes <> _size then return 'conflict_different_bytes'; end if;
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
  insert into public.email_outbox(job_id, try_number, template, user_id, status, last_error, idempotency_key)
    values (r.job_id, r.try_number, 'video-ready', j.user_id, _email_status,
      case when _email_status = 'blocked' then 'email_domain_not_configured' end,
      'video-ready-' || r.job_id::text || '-try' || r.try_number)
    on conflict do nothing;
  return 'completed';
end $$;

-- Email dispatcher: lease due rows (skip locked), bounded attempts.
CREATE FUNCTION public.claim_email_outbox(_limit integer)
RETURNS TABLE(id uuid, job_id uuid, try_number integer, template text, user_id uuid, lang text, idempotency_key text, lease_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  return query
  with due as (
    select o.id from public.email_outbox o
    where (o.status = 'queued' and o.next_attempt_at <= now()) or (o.status = 'sending' and o.lease_until < now())
    order by o.next_attempt_at limit least(greatest(_limit,1),20) for update skip locked
  )
  update public.email_outbox o set status = 'sending', lease_token = gen_random_uuid(), lease_until = now() + interval '2 minutes',
    attempts = o.attempts + 1, updated_at = now()
  from due where o.id = due.id
  returning o.id, o.job_id, o.try_number, o.template, o.user_id, o.lang, o.idempotency_key, o.lease_token;
end $$;

CREATE FUNCTION public.finish_email_outbox(_id uuid, _lease_token uuid, _result text, _error text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare o record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  if _result not in ('sent','failed','blocked','suppressed') then raise exception 'bad result'; end if;
  select * into o from public.email_outbox where id = _id for update;
  if not found then return 'not_found'; end if;
  if o.status <> 'sending' or o.lease_token is distinct from _lease_token then return 'lease_lost'; end if;
  update public.email_outbox set
    status = case when _result = 'sent' then 'sent'
                  when _result = 'blocked' then 'blocked'
                  when _result = 'suppressed' then 'failed'
                  when o.attempts >= 5 then 'failed' else 'queued' end,
    sent_at = case when _result = 'sent' then now() end,
    last_error = left(_error, 300),
    next_attempt_at = now() + make_interval(mins => least(60, (2 ^ o.attempts)::int)),
    lease_token = null, lease_until = null, updated_at = now()
  where id = _id;
  return 'ok';
end $$;

-- Admin action once an email domain is configured: move blocked rows back to queued.
CREATE FUNCTION public.requeue_blocked_emails() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare n int;
begin
  if coalesce(auth.role(),'') <> 'service_role' and not public.is_admin() then raise exception 'Admins only'; end if;
  update public.email_outbox set status = 'queued', next_attempt_at = now(), updated_at = now() where status = 'blocked';
  get diagnostics n = row_count; return n;
end $$;

REVOKE EXECUTE ON FUNCTION public.reserve_delivery(uuid, integer, text, bigint, text, text, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_delivery(uuid, uuid, text, bigint, text, text, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_email_outbox(integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finish_email_outbox(uuid, uuid, text, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.requeue_blocked_emails() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reserve_delivery(uuid, integer, text, bigint, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid, uuid, text, bigint, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_email_outbox(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_email_outbox(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.requeue_blocked_emails() TO authenticated, service_role;

-- 30s source checks: a passing row must carry a bounded positive duration.
ALTER TABLE public.source_video_checks ADD CONSTRAINT source_video_checks_ok_bounded
  CHECK (NOT ok OR (duration_ms IS NOT NULL AND duration_ms > 0 AND duration_ms <= 30050)) NOT VALID;