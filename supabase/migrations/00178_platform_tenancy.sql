-- Platform tenancy foundation — Phase 0 of the multi-tenant rebuild that lives
-- under /new. ADDITIVE ONLY: introduces the `v2_` table family and never touches
-- any existing table, so the current app is completely unaffected.
--
-- Backs org/event selection, invite-code membership, per-org branding
-- (name/logo/colors), and CUSTOM DOMAINS — organizations can point their own
-- hostname at this app and have it identify + skin itself for that org, even for
-- logged-out visitors. Identity is SHARED with the current app
-- (public.users / auth.users); one user can belong to many orgs via
-- v2_memberships. Golfapalooza is seeded as organization #1 (stable id for
-- future ETL) with every existing user backfilled as a member (admins as owners).
--
-- Org branding + domain mappings are PUBLIC-readable (needed to skin the app
-- before auth). Memberships, events, and invites are membership-gated via two
-- SECURITY DEFINER helpers so tenant isolation is real from day one.

-- ── Drop in dependency order (repo convention: DROP IF EXISTS then CREATE) ────
DROP TABLE IF EXISTS public.v2_org_domains CASCADE;
DROP TABLE IF EXISTS public.v2_events CASCADE;
DROP TABLE IF EXISTS public.v2_invites CASCADE;
DROP TABLE IF EXISTS public.v2_memberships CASCADE;
DROP TABLE IF EXISTS public.v2_organizations CASCADE;
DROP FUNCTION IF EXISTS public.v2_is_org_admin(UUID);
DROP FUNCTION IF EXISTS public.v2_is_org_member(UUID);

-- ── Organizations (the tenant) ───────────────────────────────────────────────
CREATE TABLE public.v2_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  primary_color TEXT,                 -- branding v1: name/logo/colors only
  secondary_color TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Custom domains (many hostnames → one org; drives request-time skinning) ───
CREATE TABLE public.v2_org_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL UNIQUE,      -- e.g. golf.acmecc.com (lowercased by app)
  is_primary BOOLEAN NOT NULL DEFAULT false,
  verified BOOLEAN NOT NULL DEFAULT false,  -- domain-ownership verification gate
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_org_domains_org ON public.v2_org_domains(org_id);

-- ── Memberships (user ↔ org, per-org role) ──────────────────────────────────
CREATE TABLE public.v2_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);
CREATE INDEX idx_v2_memberships_user ON public.v2_memberships(user_id);
CREATE INDEX idx_v2_memberships_org ON public.v2_memberships(org_id);

-- ── Invites (org-level for now; event-level is an additive column later) ──────
CREATE TABLE public.v2_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  max_uses INTEGER,                   -- NULL = unlimited
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,             -- NULL = never expires
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_invites_org ON public.v2_invites(org_id);

-- ── Events (many per org; NOT the old single-active-trip model) ───────────────
CREATE TABLE public.v2_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  year INTEGER,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
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
ALTER TABLE public.v2_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_org_domains   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_memberships   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_invites       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_events        ENABLE ROW LEVEL SECURITY;

-- Org branding is PUBLIC (skinning happens before auth); admins update.
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
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_organizations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_org_domains   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_memberships   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_invites       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_events        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.v2_is_org_member(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.v2_is_org_admin(UUID)  TO authenticated, service_role;

-- ── Seed: Golfapalooza = organization #1, backfill all users as members ───────
INSERT INTO public.v2_organizations (id, name, slug, primary_color)
VALUES ('00000000-0000-4000-8000-000000000001', 'Golfapalooza', 'golfapalooza', '#15803d')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.v2_memberships (org_id, user_id, role, status)
SELECT '00000000-0000-4000-8000-000000000001', u.id,
       CASE WHEN u.is_admin THEN 'owner' ELSE 'member' END, 'active'
FROM public.users u
ON CONFLICT (org_id, user_id) DO NOTHING;
