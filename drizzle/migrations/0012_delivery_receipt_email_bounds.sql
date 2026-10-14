CREATE OR REPLACE FUNCTION public.get_delivery_receipt(_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare r record; j record; e record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  select * into r from public.delivery_requests where id = _request_id;
  if not found then return null; end if;
  select status into j from public.jobs where id = r.job_id;
  select status into e from public.email_outbox where job_id = r.job_id and try_number = r.try_number and template = 'video-ready';
  return jsonb_build_object(
    'delivery_id', r.id, 'job_id', r.job_id, 'try_number', r.try_number, 'sha256', r.content_sha256,
    'size_bytes', r.size_bytes, 'state', r.state, 'status', j.status, 'file_name', r.file_name,
    'completed_at', r.completed_at, 'email', e.status);
end $$;
REVOKE EXECUTE ON FUNCTION public.get_delivery_receipt(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivery_receipt(uuid) TO service_role;

DROP FUNCTION public.claim_email_outbox(integer);
CREATE FUNCTION public.claim_email_outbox(_limit integer, _job_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, job_id uuid, try_number integer, template text, user_id uuid, lang text, idempotency_key text, lease_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  -- Expired leases that already used all 5 attempts are closed as failed, never re-leased.
  update public.email_outbox o set status = 'failed', last_error = coalesce(o.last_error, 'max_attempts'), lease_token = null, lease_until = null, updated_at = now()
    where o.status = 'sending' and o.lease_until < now() and o.attempts >= 5 and (_job_id is null or o.job_id = _job_id);
  return query
  with due as (
    select o.id from public.email_outbox o
    where o.attempts < 5
      and ((o.status = 'queued' and o.next_attempt_at <= now()) or (o.status = 'sending' and o.lease_until < now()))
      and (_job_id is null or o.job_id = _job_id)
    order by o.next_attempt_at limit least(greatest(_limit,1),20) for update skip locked
  )
  update public.email_outbox o set status = 'sending', lease_token = gen_random_uuid(), lease_until = now() + interval '2 minutes',
    attempts = o.attempts + 1, updated_at = now()
  from due where o.id = due.id
  returning o.id, o.job_id, o.try_number, o.template, o.user_id, o.lang, o.idempotency_key, o.lease_token;
end $$;
REVOKE EXECUTE ON FUNCTION public.claim_email_outbox(integer, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_outbox(integer, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_email_outbox(_id uuid, _lease_token uuid, _result text, _error text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare o record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  if _result not in ('sent','failed','blocked','suppressed') then raise exception 'bad result'; end if;
  select * into o from public.email_outbox where id = _id for update;
  if not found then return 'not_found'; end if;
  if o.status <> 'sending' or o.lease_token is distinct from _lease_token then return 'lease_lost'; end if;
  if o.lease_until is null or o.lease_until <= now() then return 'lease_expired'; end if;
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