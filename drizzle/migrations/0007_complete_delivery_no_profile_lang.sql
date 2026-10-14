CREATE OR REPLACE FUNCTION public.complete_delivery(_request_id uuid, _file_path text, _file_name text, _email_status text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare r record; j record;
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
  -- Bilingual email: language is resolved at send time; 'en' is the stored default.
  insert into public.email_outbox(job_id, try_number, template, user_id, status, last_error)
    values (r.job_id, r.try_number, 'video-ready', j.user_id, _email_status,
      case when _email_status = 'blocked' then 'email_domain_not_configured' end)
    on conflict (job_id, try_number, template) do nothing;
  return 'completed';
end $$;
REVOKE EXECUTE ON FUNCTION public.complete_delivery(uuid, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid, text, text, text) TO service_role;