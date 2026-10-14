ALTER TABLE public.source_video_checks ADD COLUMN status text;
UPDATE public.source_video_checks SET status = CASE
  WHEN ok THEN 'measured_ok'
  WHEN duration_ms IS NOT NULL THEN 'measured_too_long'
  ELSE 'rejected_media' END
WHERE status IS NULL;
ALTER TABLE public.source_video_checks ADD CONSTRAINT source_video_checks_status_check CHECK (
  status IS NULL OR
  (status = 'measured_ok' AND ok AND duration_ms > 0 AND duration_ms <= 30050) OR
  (status = 'measured_too_long' AND NOT ok AND duration_ms > 30050) OR
  (status = 'unknown_duration' AND NOT ok AND duration_ms IS NULL) OR
  (status = 'rejected_media' AND NOT ok AND duration_ms IS NULL)
);

ALTER TABLE public.jobs ADD COLUMN segment_start_seconds numeric;
ALTER TABLE public.jobs ADD COLUMN segment_end_seconds numeric;
ALTER TABLE public.jobs ADD COLUMN segment_reason text CHECK (segment_reason IS NULL OR segment_reason IN ('explicit','auto_first_30','auto_first_30_unknown_length','measured_short'));
ALTER TABLE public.jobs ADD CONSTRAINT jobs_segment_bounds CHECK (
  (segment_start_seconds IS NULL AND segment_end_seconds IS NULL) OR
  (segment_start_seconds >= 0 AND segment_end_seconds > segment_start_seconds AND segment_end_seconds - segment_start_seconds <= 30)
);

CREATE OR REPLACE FUNCTION public.create_job(_source_type text, _source_url text, _source_file_path text, _clip_start integer, _clip_end integer, _target_duration_seconds integer, _subject_type text, _subject_name text, _business_type text, _reference_image_path text, _notes text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare s public.settings; bal int; jid uuid; uid uuid := auth.uid(); chk record;
  seg_s numeric; seg_e numeric; seg_r text;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into s from public.settings where id=1;
  if _target_duration_seconds < 1 or _target_duration_seconds > s.max_video_seconds then
    raise exception 'Duration must be between 1 and % seconds', s.max_video_seconds; end if;
  if _source_type = 'upload' and (_source_file_path is null or _source_file_path not like uid::text || '/%') then
    raise exception 'Invalid source file'; end if;
  if _source_type = 'upload' then
    -- Server-side check result only (never the browser value).
    select * into chk from public.source_video_checks where file_path = _source_file_path and user_id = uid;
    if not found then raise exception 'Source video length unverified'; end if;
    if chk.status = 'measured_ok' or (chk.status is null and chk.ok and chk.duration_ms is not null) then
      seg_r := 'measured_short';
    elsif chk.status = 'unknown_duration' then
      -- Length unreadable but media structurally valid: production uses ONLY the first 30 seconds.
      seg_s := 0; seg_e := 30; seg_r := 'auto_first_30_unknown_length';
    elsif chk.status = 'measured_too_long' or (chk.status is null and not chk.ok and chk.duration_ms is not null) then
      raise exception 'Source video longer than 30 seconds';
    else
      raise exception 'Source video length unverified';
    end if;
  end if;
  if _source_type <> 'upload' and coalesce(_source_url,'') = '' then raise exception 'Source link required'; end if;
  if _source_type = 'youtube' then
    if _clip_start is null or _clip_end is null or _clip_end <= _clip_start then raise exception 'Clip segment required'; end if;
    if _clip_end - _clip_start > 30 then raise exception 'Source video longer than 30 seconds'; end if;
    seg_s := _clip_start; seg_e := _clip_end; seg_r := 'explicit';
  elsif _source_type in ('instagram_reel','tiktok','youtube_shorts') then
    if _clip_start is not null and _clip_end is not null and _clip_end > _clip_start and _clip_end - _clip_start <= 30 then
      seg_s := _clip_start; seg_e := _clip_end; seg_r := 'explicit';
    else
      -- Link length cannot be verified: enforce the first 30 seconds only.
      seg_s := 0; seg_e := 30; seg_r := 'auto_first_30';
    end if;
  end if;
  if _reference_image_path is null or _reference_image_path not like uid::text || '/%' then
    raise exception 'Reference image required'; end if;
  if coalesce(trim(_subject_name),'') = '' then raise exception 'Subject name required'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  select coalesce(sum(delta),0) into bal from public.credit_ledger where user_id=uid;
  if bal < s.credits_per_video then raise exception 'Insufficient credits'; end if;
  insert into public.jobs(user_id,source_type,source_url,source_file_path,clip_start,clip_end,target_duration_seconds,
    subject_type,subject_name,business_type,reference_image_path,notes,estimated_credits,estimated_turnaround_hours,
    segment_start_seconds,segment_end_seconds,segment_reason)
  values (uid,_source_type,nullif(_source_url,''),_source_file_path,_clip_start,_clip_end,_target_duration_seconds,
    _subject_type,_subject_name,_business_type,_reference_image_path,_notes,s.credits_per_video,s.default_turnaround_hours,
    seg_s,seg_e,seg_r)
  returning id into jid;
  insert into public.credit_ledger(user_id,delta,reason,job_id,note,created_by) values (uid,-s.credits_per_video,'job_reserve',jid,'Credit reserved for job',uid);
  return jid;
end $function$;

CREATE OR REPLACE VIEW public.jobs_feed AS
 SELECT id AS job_id, code, status, try_number, source_type, source_url, source_file_path, clip_start, clip_end,
    target_duration_seconds, subject_type, subject_name, business_type, reference_image_path, notes, created_at, updated_at,
    segment_start_seconds, segment_end_seconds, segment_reason
   FROM public.jobs;