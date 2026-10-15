ALTER TABLE public.final_upload_reservations
  ADD COLUMN IF NOT EXISTS obj_etag text, ADD COLUMN IF NOT EXISTS obj_updated_at timestamptz, ADD COLUMN IF NOT EXISTS obj_size bigint,
  ADD COLUMN IF NOT EXISTS obj_sha256 text, ADD COLUMN IF NOT EXISTS cleaned_at timestamptz;

-- Claim with job→reservation lock order. Committed reservations report idempotent success; an in-flight one is never reclaimed.
CREATE OR REPLACE FUNCTION public.claim_final_commit(_reservation_id uuid, _token uuid, _uploader uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare jid uuid; r record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  select job_id into jid from public.final_upload_reservations where id = _reservation_id;
  if jid is null then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  perform 1 from public.jobs where id = jid for update;
  select * into r from public.final_upload_reservations where id = _reservation_id for update;
  if r.token <> _token or r.uploader <> _uploader then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  if r.status = 'committed' then return jsonb_build_object('ok', true, 'already', true, 'path', r.path, 'sha256', r.obj_sha256, 'size', r.obj_size); end if;
  if r.status <> 'reserved' then return jsonb_build_object('ok', false, 'reason', 'already_' || r.status); end if;
  if r.expires_at < now() then
    update public.final_upload_reservations set status='rejected', reject_reason='expired' where id = r.id;
    return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  update public.final_upload_reservations set status='committing' where id = r.id;
  return jsonb_build_object('ok', true, 'path', r.path, 'job_id', r.job_id, 'try_number', r.try_number);
end $$;

-- Commit: job→reservation lock order; idempotent; rechecks expiry, admission and exact object identity; persists identity.
CREATE OR REPLACE FUNCTION public.commit_final_upload(_reservation_id uuid, _sha text, _size bigint, _etag text, _updated_at timestamptz, _file_name text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare jid uuid; r record; o record; err text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  select job_id into jid from public.final_upload_reservations where id = _reservation_id;
  if jid is null then return 'not_committing'; end if;
  perform 1 from public.jobs where id = jid for update;
  select * into r from public.final_upload_reservations where id = _reservation_id for update;
  if r.status = 'committed' and exists(select 1 from public.deliverables where reservation_id = r.id) then return 'ok'; end if;
  if r.status <> 'committing' then return 'not_committing'; end if;
  if r.expires_at < now() then err := 'expired'; end if;
  if err is null then err := public.final_admission_error(r.job_id, r.try_number); end if;
  if err is null then
    select metadata->>'eTag' etag, updated_at, (metadata->>'size')::bigint size into o
      from storage.objects where bucket_id = 'deliverables' and name = r.path for share;
    if not found then err := 'missing_object';
    elsif o.etag is distinct from _etag or o.updated_at is distinct from _updated_at or o.size is distinct from _size then err := 'object_changed';
    end if;
  end if;
  if err is null and (_sha is null or _sha !~ '^[0-9a-f]{64}$') then err := 'bad_hash'; end if;
  if err is not null then
    update public.final_upload_reservations set status='rejected', reject_reason=err where id = r.id;
    return err; end if;
  insert into public.deliverables(job_id, file_path, file_name, try_number, sha256, size_bytes, reservation_id)
    values (r.job_id, r.path, left(coalesce(_file_name,'final.mp4'), 200), r.try_number, _sha, _size, r.id);
  update public.final_upload_reservations set status='committed', committed_at=now(),
    obj_etag=_etag, obj_updated_at=_updated_at, obj_size=_size, obj_sha256=_sha where id = r.id;
  return 'ok';
end $$;

-- Reject only an uncommitted reservation (job→reservation lock order). Rejected is terminal: it can never commit later.
CREATE OR REPLACE FUNCTION public.reject_final_reservation(_reservation_id uuid, _reason text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare jid uuid; r record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  select job_id into jid from public.final_upload_reservations where id = _reservation_id;
  if jid is null then return null; end if;
  perform 1 from public.jobs where id = jid for update;
  select * into r from public.final_upload_reservations where id = _reservation_id for update;
  if r.status in ('reserved','committing') and not exists(select 1 from public.deliverables where reservation_id = r.id) then
    update public.final_upload_reservations set status='rejected', reject_reason=left(_reason,80) where id = r.id;
  end if;
  return null;
end $$;

-- Cleanup permit: returns the path ONLY for a rejected reservation with no deliverable that references it or its path.
CREATE OR REPLACE FUNCTION public.cleanup_rejected_final(_reservation_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare r record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  select * into r from public.final_upload_reservations where id = _reservation_id for update;
  if not found or r.status <> 'rejected' or r.cleaned_at is not null then return null; end if;
  if exists(select 1 from public.deliverables where reservation_id = r.id or file_path = r.path) then return null; end if;
  update public.final_upload_reservations set cleaned_at = now() where id = r.id;
  return r.path;
end $$;
REVOKE EXECUTE ON FUNCTION public.cleanup_rejected_final(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_rejected_final(uuid) TO service_role;

-- Attach bound to the expected attempt, only before production, never replacing an attached source.
CREATE OR REPLACE FUNCTION public.attach_job_source(_job_id uuid, _path text, _expected_try int) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare j record; chk record; obj record; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into j from public.jobs where id = _job_id for update;
  if not found or (j.user_id <> uid and not public.is_staff()) then raise exception 'Not allowed'; end if;
  if j.status in ('delivered','cancelled') then return 'terminal'; end if;
  if j.try_number is distinct from _expected_try then return 'stale_attempt'; end if;
  if j.status not in ('submitted','in_review','prompt_ready') then return 'wrong_status'; end if;
  if j.source_type = 'upload' then return 'not_link'; end if;
  if j.source_sha256 is not null or j.source_file_path is not null then return 'already_attached'; end if;
  if j.reference_image_path is null then return 'missing_reference'; end if;
  if _path not like uid::text || '/%' then return 'invalid_path'; end if;
  select * into chk from public.source_video_checks where file_path = _path and user_id = uid;
  if not found or chk.content_sha256 is null or chk.status not in ('measured_ok','unknown_duration') then return 'unverified'; end if;
  select metadata->>'eTag' etag, updated_at, (metadata->>'size')::bigint size into obj
    from storage.objects where bucket_id = 'source-videos' and name = _path for share;
  if not found or obj.etag is distinct from chk.object_etag or obj.updated_at is distinct from chk.object_updated_at or obj.size is distinct from chk.size_bytes then
    return 'changed'; end if;
  update public.jobs set source_file_path = _path, source_sha256 = chk.content_sha256 where id = _job_id;
  return 'ok';
end $$;
REVOKE EXECUTE ON FUNCTION public.attach_job_source(uuid,text,int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attach_job_source(uuid,text,int) TO authenticated, service_role;
-- Retire the unbound 2-arg version (not try-bound).
REVOKE EXECUTE ON FUNCTION public.attach_job_source(uuid,text) FROM authenticated;
COMMENT ON FUNCTION public.attach_job_source(uuid,text) IS 'DEPRECATED: replaced by attach_job_source(uuid,text,int) (try-bound)';