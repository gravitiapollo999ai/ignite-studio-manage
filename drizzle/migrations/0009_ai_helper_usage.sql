CREATE TABLE public.ai_helper_usage (
  user_id uuid NOT NULL,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  kind text NOT NULL CHECK (kind IN ('brief','prompt')),
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, kind)
);
GRANT SELECT ON public.ai_helper_usage TO authenticated;
GRANT ALL ON public.ai_helper_usage TO service_role;
ALTER TABLE public.ai_helper_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai usage own or staff read" ON public.ai_helper_usage FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff());

CREATE TABLE public.ai_helper_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_id uuid,
  kind text NOT NULL,
  model text NOT NULL,
  outcome text NOT NULL,
  input_chars integer,
  output_chars integer,
  input_sha256 text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_helper_log TO authenticated;
GRANT ALL ON public.ai_helper_log TO service_role;
ALTER TABLE public.ai_helper_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai log admin read" ON public.ai_helper_log FOR SELECT TO authenticated USING (public.is_admin());

-- Atomic per-user daily quota. Returns false when over the limit.
CREATE OR REPLACE FUNCTION public.consume_ai_quota(_user_id uuid, _kind text, _limit integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare c int;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service only'; end if;
  insert into public.ai_helper_usage(user_id, kind, count) values (_user_id, _kind, 1)
    on conflict (user_id, day, kind) do update set count = ai_helper_usage.count + 1
    returning count into c;
  if c > _limit then
    update public.ai_helper_usage set count = count - 1 where user_id = _user_id and kind = _kind and day = (now() AT TIME ZONE 'utc')::date;
    return false;
  end if;
  return true;
end $$;
REVOKE EXECUTE ON FUNCTION public.consume_ai_quota(uuid, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(uuid, text, integer) TO service_role;