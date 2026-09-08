-- v2 platform foundation, CLEAN REBUILD — supersedes 00178.
--
-- The new app is an entirely separate codebase + data model that shares only the
-- Supabase project's AUTH (auth.users) with the legacy app. It references NO
-- legacy tables: identity lives in a new `v2_profiles` table keyed to auth.users,
-- and every v2_ table references v2_profiles/auth.users — never public.users.
-- No legacy seed; the platform starts empty and groups are created self-serve.
--
-- Membership-based RLS (via two SECURITY DEFINER helpers) is the security
-- boundary for BOTH web and native clients — native apps hit PostgREST/Realtime
-- with a Supabase JWT under these same policies.

-- ── Drop 00178's objects + rebuild cleanly (dependency order) ─────────────────
DROP TABLE IF EXISTS public.v2_org_domains CASCADE;
DROP TABLE IF EXISTS public.v2_events CASCADE;
DROP TABLE IF EXISTS public.v2_invites CASCADE;
DROP TABLE IF EXISTS public.v2_memberships CASCADE;
DROP TABLE IF EXISTS public.v2_organizations CASCADE;
DROP TABLE IF EXISTS public.v2_profiles CASCADE;
DROP FUNCTION IF EXISTS public.v2_is_org_admin(UUID);
DROP FUNCTION IF EXISTS public.v2_is_org_member(UUID);

-- ── Profiles (platform identity; keyed to Supabase auth) ─────────────────────
CREATE TABLE public.v2_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Organizations (the tenant) ───────────────────────────────────────────────
CREATE TABLE public.v2_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  created_by UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Custom domains (many hostnames → one org; drives request-time skinning) ───
CREATE TABLE public.v2_org_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL UNIQUE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_org_domains_org ON public.v2_org_domains(org_id);

-- ── Memberships (user ↔ org, per-org role) ──────────────────────────────────
CREATE TABLE public.v2_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);
CREATE INDEX idx_v2_memberships_user ON public.v2_memberships(user_id);
CREATE INDEX idx_v2_memberships_org ON public.v2_memberships(org_id);

-- ── Invites (creator is the only auto-member; all others join by code) ────────
CREATE TABLE public.v2_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_invites_org ON public.v2_invites(org_id);

-- ── Events (many per org) ────────────────────────────────────────────────────
CREATE TABLE public.v2_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  year INTEGER,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_events_org ON public.v2_events(org_id);

-- ── Membership predicates (SECURITY DEFINER to avoid RLS recursion) ───────────
CREATE FUNCTION public.v2_is_org_member(p_org UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.v2_memberships m
    WHERE m.org_id = p_org AND m.user_id = auth.uid() AND m.status = 'active'
  );
$$;

CREATE FUNCTION public.v2_is_org_admin(p_org UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.v2_memberships m
    WHERE m.org_id = p_org AND m.user_id = auth.uid()
      AND m.status = 'active' AND m.role IN ('owner','admin')
  );
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.v2_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_org_domains   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_memberships   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_invites       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_events        ENABLE ROW LEVEL SECURITY;

-- Profiles: you manage your own; co-members are readable so rosters render.
CREATE POLICY "v2_profile_select_self" ON public.v2_profiles FOR SELECT
  TO authenticated USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.v2_memberships me
      JOIN public.v2_memberships them ON them.org_id = me.org_id
      WHERE me.user_id = auth.uid() AND me.status = 'active' AND them.user_id = v2_profiles.id
    )
  );
CREATE POLICY "v2_profile_insert_self" ON public.v2_profiles FOR INSERT
  TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "v2_profile_update_self" ON public.v2_profiles FOR UPDATE
  TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Org branding is PUBLIC (skinning before auth); admins update.
CREATE POLICY "v2_org_select_public" ON public.v2_organizations FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "v2_org_insert" ON public.v2_organizations FOR INSERT
  TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "v2_org_update" ON public.v2_organizations FOR UPDATE
  TO authenticated USING (public.v2_is_org_admin(id)) WITH CHECK (public.v2_is_org_admin(id));

-- Domain → org mapping is PUBLIC-readable (request-time resolution); admins manage.
CREATE POLICY "v2_domain_select_public" ON public.v2_org_domains FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "v2_domain_write" ON public.v2_org_domains FOR ALL
  TO authenticated USING (public.v2_is_org_admin(org_id)) WITH CHECK (public.v2_is_org_admin(org_id));

-- Memberships: you see your own rows; org admins see/manage all in the org.
CREATE POLICY "v2_membership_select" ON public.v2_memberships FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR public.v2_is_org_admin(org_id));
CREATE POLICY "v2_membership_write" ON public.v2_memberships FOR ALL
  TO authenticated USING (public.v2_is_org_admin(org_id)) WITH CHECK (public.v2_is_org_admin(org_id));

-- Invites: org admins only. Redemption happens server-side via the service role.
CREATE POLICY "v2_invite_all" ON public.v2_invites FOR ALL
  TO authenticated USING (public.v2_is_org_admin(org_id)) WITH CHECK (public.v2_is_org_admin(org_id));

-- Events: members read; admins write.
CREATE POLICY "v2_event_select" ON public.v2_events FOR SELECT
  TO authenticated USING (public.v2_is_org_member(org_id));
CREATE POLICY "v2_event_write" ON public.v2_events FOR ALL
  TO authenticated USING (public.v2_is_org_admin(org_id)) WITH CHECK (public.v2_is_org_admin(org_id));

-- ── Grants (branding/domains public-readable; RLS still restricts writes) ─────
GRANT SELECT ON TABLE public.v2_organizations TO anon;
GRANT SELECT ON TABLE public.v2_org_domains   TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_profiles      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_organizations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_org_domains   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_memberships   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_invites       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_events        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.v2_is_org_member(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.v2_is_org_admin(UUID)  TO authenticated, service_role;
