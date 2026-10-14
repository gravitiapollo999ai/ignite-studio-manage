ALTER TABLE public.settings ADD COLUMN eta_queue_minutes integer NOT NULL DEFAULT 30 CHECK (eta_queue_minutes BETWEEN 0 AND 1440);
ALTER TABLE public.settings ADD COLUMN eta_review_minutes integer NOT NULL DEFAULT 15 CHECK (eta_review_minutes BETWEEN 0 AND 1440);
ALTER TABLE public.settings ADD COLUMN eta_generating_minutes integer NOT NULL DEFAULT 30 CHECK (eta_generating_minutes BETWEEN 0 AND 1440);
ALTER TABLE public.settings ADD COLUMN eta_qa_minutes integer NOT NULL DEFAULT 15 CHECK (eta_qa_minutes BETWEEN 0 AND 1440);

CREATE TABLE public.job_eta_overrides (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id),
  ready_at timestamptz,
  review_minutes integer CHECK (review_minutes BETWEEN 0 AND 10080),
  generating_minutes integer CHECK (generating_minutes BETWEEN 0 AND 10080),
  qa_minutes integer CHECK (qa_minutes BETWEEN 0 AND 10080),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.job_eta_overrides TO authenticated;
GRANT ALL ON public.job_eta_overrides TO service_role;
ALTER TABLE public.job_eta_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eta overrides staff read" ON public.job_eta_overrides FOR SELECT TO authenticated USING (public.is_staff());

CREATE OR REPLACE FUNCTION public.set_job_eta(_job_id uuid, _ready_at timestamptz, _review integer, _generating integer, _qa integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if not exists (select 1 from public.jobs where id = _job_id) then raise exception 'Job not found'; end if;
  insert into public.job_eta_overrides(job_id, ready_at, review_minutes, generating_minutes, qa_minutes, updated_by, updated_at)
    values (_job_id, _ready_at, _review, _generating, _qa, auth.uid(), now())
  on conflict (job_id) do update set ready_at = excluded.ready_at, review_minutes = excluded.review_minutes,
    generating_minutes = excluded.generating_minutes, qa_minutes = excluded.qa_minutes, updated_by = excluded.updated_by, updated_at = now();
end $$;
REVOKE EXECUTE ON FUNCTION public.set_job_eta(uuid, timestamptz, integer, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_job_eta(uuid, timestamptz, integer, integer, integer) TO authenticated;

-- Inputs for the client-side estimate: owner or staff only; exposes only a queue count, never other clients' data.
CREATE OR REPLACE FUNCTION public.get_job_eta(_job_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare j record; s record; o record; ahead int; started timestamptz;
begin
  select id, user_id, status, created_at into j from public.jobs where id = _job_id;
  if not found or (j.user_id <> auth.uid() and not public.is_staff()) then return null; end if;
  select eta_queue_minutes, eta_review_minutes, eta_generating_minutes, eta_qa_minutes into s from public.settings where id = 1;
  select * into o from public.job_eta_overrides where job_id = _job_id;
  select count(*) into ahead from public.jobs x
    where x.created_at < j.created_at and x.status in ('submitted','revision','in_review','prompt_ready','generating','qa');
  select max(e.created_at) into started from public.job_events e where e.job_id = _job_id and e.status = j.status;
  return jsonb_build_object(
    'status', j.status, 'jobs_ahead', ahead, 'stage_started_at', coalesce(started, j.created_at),
    'queue_minutes', s.eta_queue_minutes, 'review_minutes', coalesce(o.review_minutes, s.eta_review_minutes),
    'generating_minutes', coalesce(o.generating_minutes, s.eta_generating_minutes), 'qa_minutes', coalesce(o.qa_minutes, s.eta_qa_minutes),
    'ready_at_override', o.ready_at);
end $$;
REVOKE EXECUTE ON FUNCTION public.get_job_eta(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_job_eta(uuid) TO authenticated;