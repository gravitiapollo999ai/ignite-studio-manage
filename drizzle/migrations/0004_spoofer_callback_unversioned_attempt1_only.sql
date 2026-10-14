CREATE OR REPLACE FUNCTION public.apply_spoofer_callback(
  _job_id uuid, _event_id text, _status text, _message text, _try_number integer,
  _file_path text, _file_name text, _remote_job_id text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare j record; cur int; nxt int; inserted int; has_file boolean;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  select id, status, try_number into j from public.jobs where id = _job_id for update;
  if not found then return 'not_found'; end if;
  insert into public.spoofer_sync_log(job_id, direction, event, ok, event_id, message)
    values (_job_id, 'inbound', 'status:' || _status, true, _event_id, 'claimed') on conflict (event_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return 'duplicate'; end if;
  -- Unversioned callbacks are legacy-compatible only for attempt 1; never assigned to a revised attempt.
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
end $$;
REVOKE EXECUTE ON FUNCTION public.apply_spoofer_callback(uuid, text, text, text, integer, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_spoofer_callback(uuid, text, text, text, integer, text, text, text) TO service_role;