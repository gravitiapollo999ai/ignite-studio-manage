CREATE TABLE public.source_video_checks (
  file_path text PRIMARY KEY,
  user_id uuid NOT NULL,
  duration_ms integer,
  ok boolean NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.source_video_checks TO authenticated;
GRANT ALL ON public.source_video_checks TO service_role;
ALTER TABLE public.source_video_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc read own" ON public.source_video_checks FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.create_job(_source_type text, _source_url text, _source_file_path text, _clip_start integer, _clip_end integer, _target_duration_seconds integer, _subject_type text, _subject_name text, _business_type text, _reference_image_path text, _notes text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare s public.settings; bal int; jid uuid; uid uuid := auth.uid(); chk record;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into s from public.settings where id=1;
  if _target_duration_seconds < 1 or _target_duration_seconds > s.max_video_seconds then
    raise exception 'Duration must be between 1 and % seconds', s.max_video_seconds; end if;
  if _source_type = 'upload' and (_source_file_path is null or _source_file_path not like uid::text || '/%') then
    raise exception 'Invalid source file'; end if;
  -- Uploaded source length must have been measured server-side from the file header (never the browser value).
  if _source_type = 'upload' then
    select * into chk from public.source_video_checks where file_path = _source_file_path and user_id = uid;
    if not found or chk.duration_ms is null then raise exception 'Source video length unverified'; end if;
    if not chk.ok then raise exception 'Source video longer than 30 seconds'; end if;
  end if;
  if _source_type <> 'upload' and coalesce(_source_url,'') = '' then raise exception 'Source link required'; end if;
  -- Regular YouTube: an explicit start/end segment of at most 30 s is required (the only trusted length we have for links).
  if _source_type = 'youtube' then
    if _clip_start is null or _clip_end is null or _clip_end <= _clip_start then raise exception 'Clip segment required'; end if;
    if _clip_end - _clip_start > 30 then raise exception 'Source video longer than 30 seconds'; end if;
  end if;
  if _reference_image_path is null or _reference_image_path not like uid::text || '/%' then
    raise exception 'Reference image required'; end if;
  if coalesce(trim(_subject_name),'') = '' then raise exception 'Subject name required'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  select coalesce(sum(delta),0) into bal from public.credit_ledger where user_id=uid;
  if bal < s.credits_per_video then raise exception 'Insufficient credits'; end if;
  insert into public.jobs(user_id,source_type,source_url,source_file_path,clip_start,clip_end,target_duration_seconds,
    subject_type,subject_name,business_type,reference_image_path,notes,estimated_credits,estimated_turnaround_hours)
  values (uid,_source_type,nullif(_source_url,''),_source_file_path,_clip_start,_clip_end,_target_duration_seconds,
    _subject_type,_subject_name,_business_type,_reference_image_path,_notes,s.credits_per_video,s.default_turnaround_hours)
  returning id into jid;
  insert into public.credit_ledger(user_id,delta,reason,job_id,note,created_by) values (uid,-s.credits_per_video,'job_reserve',jid,'Credit reserved for job',uid);
  return jid;
end $function$;