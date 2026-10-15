ALTER TABLE public.deliverables ADD COLUMN IF NOT EXISTS sha256 text, ADD COLUMN IF NOT EXISTS size_bytes bigint, ADD COLUMN IF NOT EXISTS reservation_id uuid;

CREATE TABLE public.final_upload_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  try_number int NOT NULL,
  path text NOT NULL UNIQUE,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  uploader uuid NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','committing','committed','rejected')),
  reject_reason text,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz
);
GRANT SELECT ON public.final_upload_reservations TO authenticated;
GRANT ALL ON public.final_upload_reservations TO service_role;
ALTER TABLE public.final_upload_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read reservations" ON public.final_upload_reservations FOR SELECT TO authenticated USING (public.is_staff());

-- Admission rule shared by reserve and commit (recheck under lock).
CREATE OR REPLACE FUNCTION public.final_admission_error(_job_id uuid, _try int) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare j record;
begin
  select status, try_number, segment_reason into j from public.jobs where id = _job_id;
  if not found then return 'job_not_found'; end if;
  if j.status in ('delivered','cancelled') then return 'terminal'; end if;
  if j.status not in ('generating','qa','revision') then return 'wrong_status'; end if;
  if _try is distinct from j.try_number then return 'stale_attempt'; end if;
  if public.is_segment_restricted(j.segment_reason) then return 'segment_restricted'; end if;
  return null;
end $$;
REVOKE EXECUTE ON FUNCTION public.final_admission_error(uuid,int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.final_admission_error(uuid,int) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_final_upload(_job_id uuid, _try_number int) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare err text; rid uuid := gen_random_uuid(); p text; tok uuid;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  perform 1 from public.jobs where id = _job_id for update;
  err := public.final_admission_error(_job_id, _try_number);
  if err is not null then return jsonb_build_object('ok', false, 'reason', err); end if;
  p := _job_id::text || '/try' || _try_number || '/' || rid::text || '/final.mp4';
  insert into public.final_upload_reservations(id, job_id, try_number, path, uploader) values (rid, _job_id, _try_number, p, auth.uid()) returning token into tok;
  return jsonb_build_object('ok', true, 'reservation_id', rid, 'path', p, 'token', tok);
end $$;
REVOKE EXECUTE ON FUNCTION public.reserve_final_upload(uuid,int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reserve_final_upload(uuid,int) TO authenticated, service_role;

-- Service-only: claim once (reserved -> committing) and return the fenced path.
CREATE OR REPLACE FUNCTION public.claim_final_commit(_reservation_id uuid, _token uuid, _uploader uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare r record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  select * into r from public.final_upload_reservations where id = _reservation_id for update;
  if not found or r.token <> _token or r.uploader <> _uploader then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  if r.status <> 'reserved' then return jsonb_build_object('ok', false, 'reason', 'already_' || r.status); end if;
  if r.expires_at < now() then
    update public.final_upload_reservations set status='rejected', reject_reason='expired' where id = r.id;
    return jsonb_build_object('ok', false, 'reason', 'expired', 'path', r.path); end if;
  update public.final_upload_reservations set status='committing' where id = r.id;
  return jsonb_build_object('ok', true, 'path', r.path, 'job_id', r.job_id, 'try_number', r.try_number);
end $$;
REVOKE EXECUTE ON FUNCTION public.claim_final_commit(uuid,uuid,uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_final_commit(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.final_object_identity(_path text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare o record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  select metadata->>'eTag' etag, updated_at, (metadata->>'size')::bigint size into o from storage.objects where bucket_id = 'deliverables' and name = _path;
  if not found then return null; end if;
  return jsonb_build_object('etag', o.etag, 'updated_at', o.updated_at, 'size', o.size);
end $$;
REVOKE EXECUTE ON FUNCTION public.final_object_identity(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.final_object_identity(text) TO service_role;

-- Service-only commit with server-computed values; rechecks job + exact object identity under lock.
CREATE OR REPLACE FUNCTION public.commit_final_upload(_reservation_id uuid, _sha text, _size bigint, _etag text, _updated_at timestamptz, _file_name text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare r record; o record; err text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  select * into r from public.final_upload_reservations where id = _reservation_id for update;
  if not found or r.status <> 'committing' then return 'not_committing'; end if;
  perform 1 from public.jobs where id = r.job_id for update;
  err := public.final_admission_error(r.job_id, r.try_number);
  if err is null then
    select metadata->>'eTag' etag, updated_at, (metadata->>'size')::bigint size into o
      from storage.objects where bucket_id = 'deliverables' and name = r.path for share;
    if not found then err := 'missing_object';
    elsif o.etag is distinct from _etag or o.updated_at is distinct from _updated_at or o.size is distinct from _size then err := 'object_changed';
    end if;
  end if;
  if _sha !~ '^[0-9a-f]{64}$' and err is null then err := 'bad_hash'; end if;
  if err is not null then
    update public.final_upload_reservations set status='rejected', reject_reason=err where id = r.id;
    return err; end if;
  insert into public.deliverables(job_id, file_path, file_name, try_number, sha256, size_bytes, reservation_id)
    values (r.job_id, r.path, left(coalesce(_file_name,'final.mp4'), 200), r.try_number, _sha, _size, r.id);
  update public.final_upload_reservations set status='committed', committed_at=now() where id = r.id;
  return 'ok';
end $$;
REVOKE EXECUTE ON FUNCTION public.commit_final_upload(uuid,text,bigint,text,timestamptz,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_final_upload(uuid,text,bigint,text,timestamptz,text) TO service_role;

CREATE OR REPLACE FUNCTION public.reject_final_reservation(_reservation_id uuid, _reason text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare r record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  update public.final_upload_reservations set status='rejected', reject_reason=left(_reason,80)
    where id = _reservation_id and status in ('reserved','committing') returning path into r;
  return r.path;
end $$;
REVOKE EXECUTE ON FUNCTION public.reject_final_reservation(uuid,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_final_reservation(uuid,text) TO service_role;

-- Link jobs: attach a verified uploaded source (owner or staff), bound to the exact checked bytes.
CREATE OR REPLACE FUNCTION public.attach_job_source(_job_id uuid, _path text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare j record; chk record; obj record; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into j from public.jobs where id = _job_id for update;
  if not found or (j.user_id <> uid and not public.is_staff()) then raise exception 'Not allowed'; end if;
  if j.status in ('delivered','cancelled') then return 'terminal'; end if;
  if j.source_type = 'upload' then return 'not_link'; end if;
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
REVOKE EXECUTE ON FUNCTION public.attach_job_source(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attach_job_source(uuid,text) TO authenticated, service_role;