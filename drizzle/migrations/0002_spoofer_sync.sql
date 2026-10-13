CREATE TABLE public.spoofer_sync (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','synced','failed')),
  remote_job_id text,
  remote_status text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spoofer_sync TO authenticated;
GRANT ALL ON public.spoofer_sync TO service_role;
ALTER TABLE public.spoofer_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync admin read" ON public.spoofer_sync FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE public.spoofer_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id),
  direction text NOT NULL CHECK (direction IN ('outbound','inbound')),
  event text NOT NULL,
  ok boolean NOT NULL,
  http_status integer,
  message text,
  event_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spoofer_sync_log TO authenticated;
GRANT ALL ON public.spoofer_sync_log TO service_role;
ALTER TABLE public.spoofer_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync log admin read" ON public.spoofer_sync_log FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.enqueue_spoofer_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  insert into public.spoofer_sync(job_id) values (new.id) on conflict (job_id) do nothing;
  return new;
end $$;
CREATE TRIGGER jobs_enqueue_spoofer AFTER INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.enqueue_spoofer_sync();

CREATE OR REPLACE FUNCTION public.admin_queue_spoofer_sync(_job_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if not exists (select 1 from public.jobs where id=_job_id) then raise exception 'Job not found'; end if;
  insert into public.spoofer_sync(job_id) values (_job_id)
  on conflict (job_id) do update set state = case when spoofer_sync.state='synced' then 'synced' else 'pending' end, next_attempt_at = now(), updated_at = now();
end $$;
REVOKE EXECUTE ON FUNCTION public.admin_queue_spoofer_sync(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_spoofer_sync() FROM anon, authenticated;