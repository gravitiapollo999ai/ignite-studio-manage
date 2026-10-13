ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';

-- Staff = admin or manager (text compare so the new enum value is usable in this migration)
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text IN ('admin','manager'))
$$;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- Managers can view users, balances and jobs (read only)
CREATE POLICY "staff read profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "staff read ledger" ON public.credit_ledger FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "staff read jobs" ON public.jobs FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "staff read roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_staff());

-- Admins and managers may grant/remove free credits (note required, logged in credit_ledger)
CREATE OR REPLACE FUNCTION public.admin_adjust_credits(_user_id uuid, _delta int, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE bal int;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Admins or managers only'; END IF;
  IF _delta = 0 THEN RAISE EXCEPTION 'Amount cannot be zero'; END IF;
  IF coalesce(trim(_note),'') = '' THEN RAISE EXCEPTION 'Note required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(_user_id::text));
  SELECT coalesce(sum(delta),0) INTO bal FROM public.credit_ledger WHERE user_id=_user_id;
  IF bal + _delta < 0 THEN RAISE EXCEPTION 'Balance cannot go below zero'; END IF;
  INSERT INTO public.credit_ledger(user_id,delta,reason,note,created_by)
  VALUES (_user_id,_delta, CASE WHEN _delta > 0 THEN 'admin_grant' ELSE 'adjustment' END, _note, auth.uid());
END $$;

-- Audit interface over the ledger (single source of truth, no double entries)
CREATE VIEW public.credit_transactions WITH (security_invoker = true) AS
  SELECT id, user_id, delta AS amount, reason AS kind, note, job_id, credit_request_id, created_by, created_at
  FROM public.credit_ledger;
GRANT SELECT ON public.credit_transactions TO authenticated, service_role;

-- Role management: admins only; cannot remove the last admin
CREATE OR REPLACE FUNCTION public.set_user_role(_user_id uuid, _role text, _grant boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF _role NOT IN ('admin','manager') THEN RAISE EXCEPTION 'Invalid role'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=_user_id) THEN RAISE EXCEPTION 'User not found'; END IF;
  IF _grant THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, _role::public.app_role) ON CONFLICT DO NOTHING;
  ELSE
    IF _role = 'admin' AND (SELECT count(*) FROM public.user_roles WHERE role::text='admin' AND user_id <> _user_id) = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last admin'; END IF;
    DELETE FROM public.user_roles WHERE user_id=_user_id AND role::text=_role;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid,text,boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid,text,boolean) TO authenticated;

-- Live balance updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_ledger;

-- Business profile
CREATE TABLE public.business_profiles (
  user_id uuid PRIMARY KEY,
  business_name text, business_email text, phone text, website text,
  country text, city text, industry text, description text, target_audience text,
  products_services text, brand_colors text, logo_path text,
  instagram text, tiktok text, facebook text, youtube text,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.business_profiles TO authenticated;
GRANT ALL ON public.business_profiles TO service_role;
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bp read" ON public.business_profiles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff());
CREATE POLICY "bp insert own" ON public.business_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "bp update own" ON public.business_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER bp_touch BEFORE UPDATE ON public.business_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "business logos own insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'business-logos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "business logos own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'business-logos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "business logos read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'business-logos' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_staff()));

-- Social connections (public status only; tokens live in a server-only table)
CREATE TABLE public.social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('tiktok','instagram','facebook','youtube')),
  account_name text,
  account_id text,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','connected','expired','error')),
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
GRANT SELECT, DELETE ON public.social_connections TO authenticated;
GRANT ALL ON public.social_connections TO service_role;
ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sc read" ON public.social_connections FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff());
CREATE POLICY "sc delete own" ON public.social_connections FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.social_tokens (
  connection_id uuid PRIMARY KEY REFERENCES public.social_connections(id) ON DELETE CASCADE,
  access_token text, refresh_token text, expires_at timestamptz, scopes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.social_tokens TO service_role;
ALTER TABLE public.social_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deliverable_id uuid NOT NULL REFERENCES public.deliverables(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('tiktok','instagram','facebook','youtube')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','publishing','published','failed')),
  external_post_id text, error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.social_posts TO authenticated;
GRANT ALL ON public.social_posts TO service_role;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp read" ON public.social_posts FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff());