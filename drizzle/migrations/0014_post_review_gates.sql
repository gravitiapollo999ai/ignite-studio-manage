ALTER TABLE public.source_video_checks ADD COLUMN IF NOT EXISTS content_sha256 text CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE public.source_video_checks ADD COLUMN IF NOT EXISTS size_bytes bigint;
ALTER TABLE public.source_video_checks ADD COLUMN IF NOT EXISTS object_etag text;
ALTER TABLE public.source_video_checks ADD COLUMN IF NOT EXISTS object_updated_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source_sha256 text;
COMMENT ON COLUMN public.jobs.source_sha256 IS 'SHA-256 of the uploaded source bytes, bound at create_job to the storage object identity. Null for links.';

-- Storage identity snapshot (service only): etag + updated_at + size change on any overwrite.
CREATE OR REPLACE FUNCTION public.source_object_identity(_path text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare o record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  select metadata->>'eTag' etag, updated_at, (metadata->>'size')::bigint size into o
    from storage.objects where bucket_id = 'source-videos' and name = _path;
  if not found then return null; end if;
  return jsonb_build_object('etag', o.etag, 'updated_at', o.updated_at, 'size', o.size);
end $$;
REVOKE EXECUTE ON FUNCTION public.source_object_identity(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.source_object_identity(text) TO service_role;

-- Records a verification only if the object is still the exact one that was hashed (fail closed on overwrite race).
CREATE OR REPLACE FUNCTION public.record_source_check(_path text, _user_id uuid, _status text, _duration_ms integer, _sha text, _size bigint, _etag text, _updated_at timestamptz) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare o record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  select metadata->>'eTag' etag, updated_at, (metadata->>'size')::bigint size into o
    from storage.objects where bucket_id = 'source-videos' and name = _path for share;
  if not found then return 'missing'; end if;
  if o.etag is distinct from _etag or o.updated_at is distinct from _updated_at or o.size is distinct from _size then return 'changed'; end if;
  insert into public.source_video_checks(file_path, user_id, ok, status, duration_ms, checked_at, content_sha256, size_bytes, object_etag, object_updated_at)
  values (_path, _user_id, _status = 'measured_ok', _status, _duration_ms, now(), _sha, _size, _etag, _updated_at)
  on conflict (file_path) do update set user_id = excluded.user_id, ok = excluded.ok, status = excluded.status, duration_ms = excluded.duration_ms,
    checked_at = now(), content_sha256 = excluded.content_sha256, size_bytes = excluded.size_bytes, object_etag = excluded.object_etag, object_updated_at = excluded.object_updated_at;
  return 'ok';
end $$;
REVOKE EXECUTE ON FUNCTION public.record_source_check(text, uuid, text, integer, text, bigint, text, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_source_check(text, uuid, text, integer, text, bigint, text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.create_job(_source_type text, _source_url text, _source_file_path text, _clip_start integer, _clip_end integer, _target_duration_seconds integer, _subject_type text, _subject_name text, _business_type text, _reference_image_path text, _notes text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare s public.settings; bal int; jid uuid; uid uuid := auth.uid(); chk record; obj record;
  seg_s numeric; seg_e numeric; seg_r text; src_sha text;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into s from public.settings where id=1;
  if _target_duration_seconds < 1 or _target_duration_seconds > s.max_video_seconds then
    raise exception 'Duration must be between 1 and % seconds', s.max_video_seconds; end if;
  if _source_type = 'upload' and (_source_file_path is null or _source_file_path not like uid::text || '/%') then
    raise exception 'Invalid source file'; end if;
  if _source_type = 'upload' then
    select * into chk from public.source_video_checks where file_path = _source_file_path and user_id = uid;
    if not found or chk.content_sha256 is null then raise exception 'Source video length unverified'; end if;
    -- Bind to the exact verified bytes: any overwrite changes etag/updated_at/size. Lock blocks concurrent overwrite.
    select metadata->>'eTag' etag, updated_at, (metadata->>'size')::bigint size into obj
      from storage.objects where bucket_id = 'source-videos' and name = _source_file_path for share;
    if not found or obj.etag is distinct from chk.object_etag or obj.updated_at is distinct from chk.object_updated_at or obj.size is distinct from chk.size_bytes then
      raise exception 'Source video changed since it was checked; please re-upload'; end if;
    src_sha := chk.content_sha256;
    if chk.status = 'measured_ok' then
      seg_r := 'measured_short';
    elsif chk.status = 'unknown_duration' then
      seg_s := 0; seg_e := 30; seg_r := 'auto_first_30_unknown_length';
    elsif chk.status = 'measured_too_long' then
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
    segment_start_seconds,segment_end_seconds,segment_reason,source_sha256)
  values (uid,_source_type,nullif(_source_url,''),_source_file_path,_clip_start,_clip_end,_target_duration_seconds,
    _subject_type,_subject_name,_business_type,_reference_image_path,_notes,s.credits_per_video,s.default_turnaround_hours,
    seg_s,seg_e,seg_r,src_sha)
  returning id into jid;
  insert into public.credit_ledger(user_id,delta,reason,job_id,note,created_by) values (uid,-s.credits_per_video,'job_reserve',jid,'Credit reserved for job',uid);
  return jid;
end $function$;

-- Restricted-segment jobs are held (not pushed) while segment transport is off.
ALTER TABLE public.spoofer_sync DROP CONSTRAINT spoofer_sync_state_check;
ALTER TABLE public.spoofer_sync ADD CONSTRAINT spoofer_sync_state_check CHECK (state IN ('pending','sending','synced','failed','held_segment'));
ALTER TABLE public.spoofer_sync ADD COLUMN IF NOT EXISTS held_reason text;

CREATE OR REPLACE FUNCTION public.release_held_segment(_job_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.spoofer_sync set state = 'pending', held_reason = null, next_attempt_at = now(), updated_at = now()
    where job_id = _job_id and state = 'held_segment';
  return found;
end $$;
REVOKE EXECUTE ON FUNCTION public.release_held_segment(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.release_held_segment(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_segment_restricted(_reason text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ select _reason is not null and _reason <> 'measured_short' $$;

-- Legacy Bearer callback can no longer mark a segment-restricted job Delivered (only complete_delivery with evidence can).
CREATE OR REPLACE FUNCTION public.apply_spoofer_callback(_job_id uuid, _event_id text, _status text, _message text, _try_number integer, _file_path text, _file_name text, _remote_job_id text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare j record; cur int; nxt int; inserted int; has_file boolean;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  select id, status, try_number, segment_reason into j from public.jobs where id = _job_id for update;
  if not found then return 'not_found'; end if;
  insert into public.spoofer_sync_log(job_id, direction, event, ok, event_id, message)
    values (_job_id, 'inbound', 'status:' || _status, true, _event_id, 'claimed') on conflict (event_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return 'duplicate'; end if;
  if (_try_number is null and j.try_number > 1) or (_try_number is not null and _try_number <> j.try_number) then
    update public.spoofer_sync_log set ok = false, event = event || ':attempt_mismatch',
      message = format('callback try %s, job try %s', coalesce(_try_number::text, 'none'), j.try_number) where event_id = _event_id;
    return 'attempt_mismatch';
  end if;
  cur := public.spoofer_status_rank(j.status); nxt := public.spoofer_status_rank(_status);
  if nxt is null or nxt >= 99 then raise exception 'Unsupported status'; end if;
  if cur >= 5 or nxt < cur then
    update public.spoofer_sync_log set ok = false, event = event || ':stale', message = format('ignored: job is %s', j.status) where event_id = _event_id;
    return case when cur >= 5 then 'terminal' else 'stale' end;
  end if;
  if _status = 'delivered' and public.is_segment_restricted(j.segment_reason) then
    update public.spoofer_sync_log set ok = false, event = event || ':evidence_required', message = 'segment-restricted job: deliver via deliver-video with trim evidence' where event_id = _event_id;
    return 'evidence_required';
  end if;
  if _file_path is not null then
    if not exists (select 1 from public.deliverables where job_id = _job_id and file_name = _file_name and try_number = j.try_number) then
      insert into public.deliverables(job_id, file_path, file_name, try_number) values (_job_id, _file_path, _file_name, j.try_number);
    end if;
  end if;
  if _status = 'delivered' then
    select exists (select 1 from public.deliverables where job_id = _job_id and try_number = j.try_number) into has_file;
    if not has_file then raise exception 'delivered requires final_video'; end if;
  end if;
  if nxt > cur then
    perform set_config('app.status_message', coalesce(_message, ''), true);
    update public.jobs set status = _status where id = _job_id;
    perform set_config('app.status_message', '', true);
  end if;
  update public.spoofer_sync set remote_status = _status, remote_job_id = coalesce(_remote_job_id, remote_job_id), updated_at = now() where job_id = _job_id;
  update public.spoofer_sync_log set message = case when nxt > cur then 'applied' else 'no change' end where event_id = _event_id;
  return case when nxt > cur then 'applied' else 'noop' end;
end $function$;

-- ETA override bounds.
CREATE OR REPLACE FUNCTION public.set_job_eta(_job_id uuid, _ready_at timestamp with time zone, _review integer, _generating integer, _qa integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if not exists (select 1 from public.jobs where id = _job_id) then raise exception 'Job not found'; end if;
  if (_review is not null and (_review < 0 or _review > 10080)) or (_generating is not null and (_generating < 0 or _generating > 10080))
     or (_qa is not null and (_qa < 0 or _qa > 10080)) then raise exception 'Stage minutes must be 0–10080'; end if;
  if _ready_at is not null and (_ready_at < now() - interval '1 day' or _ready_at > now() + interval '60 days') then raise exception 'Ready time out of range'; end if;
  insert into public.job_eta_overrides(job_id, ready_at, review_minutes, generating_minutes, qa_minutes, updated_by, updated_at)
    values (_job_id, _ready_at, _review, _generating, _qa, auth.uid(), now())
  on conflict (job_id) do update set ready_at = excluded.ready_at, review_minutes = excluded.review_minutes,
    generating_minutes = excluded.generating_minutes, qa_minutes = excluded.qa_minutes, updated_by = excluded.updated_by, updated_at = now();
end $function$;