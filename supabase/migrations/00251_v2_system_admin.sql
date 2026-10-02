-- 00251_v2_system_admin.sql
-- Platform "system admin" tier (GH #178). A system admin is a PLATFORM-level
-- operator who can see and manage every group (v2_organizations), independent of
-- per-org membership/role. The flag lives on v2_profiles and is NEVER read through
-- the RLS cookie client — only the service-role client reads it server-side — so a
-- user can't escalate themselves by writing their own profile row.

ALTER TABLE public.v2_profiles
  ADD COLUMN IF NOT EXISTS is_system_admin BOOLEAN NOT NULL DEFAULT false;

-- Bootstrap the first system admin (Jeff). Nothing in the app grants this flag yet,
-- so seed it here. Match on the SMS-OTP phone (digits-normalized against both the
-- 11-digit country-coded and 10-digit forms) with an email fallback.
UPDATE public.v2_profiles p
SET is_system_admin = true
FROM auth.users u
WHERE p.id = u.id
  AND (
    regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g') IN ('16143275066', '6143275066')
    OR u.email = 'claude.ai@jeffblankenburg.com'
  );

-- Cross-org overview for the system-admin "all groups" screen. Does the per-org
-- member/event COUNTs in SQL (one row per org) so the app never has to pull every
-- membership row client-side and trip the 1000-row select cap. Read ONLY via the
-- service-role client (RLS on v2_organizations would otherwise hide other orgs).
DROP VIEW IF EXISTS public.v2_org_overview;
CREATE VIEW public.v2_org_overview AS
SELECT
  o.id,
  o.name,
  o.slug,
  o.logo_url,
  o.primary_color,
  o.created_at,
  o.created_by,
  (SELECT p.display_name FROM public.v2_profiles p WHERE p.id = o.created_by) AS creator_name,
  (
    SELECT COUNT(*) FROM public.v2_memberships m
    WHERE m.org_id = o.id AND m.status = 'active' AND m.archived_at IS NULL
  ) AS member_count,
  (
    SELECT COUNT(*) FROM public.v2_events e WHERE e.org_id = o.id
  ) AS event_count,
  (
    SELECT e.name FROM public.v2_events e
    WHERE e.org_id = o.id AND e.status = 'active'
    ORDER BY e.created_at DESC LIMIT 1
  ) AS active_event_name
FROM public.v2_organizations o;

-- Server-only. Keep the overview out of reach of the anon/authenticated RLS clients.
GRANT SELECT ON public.v2_org_overview TO service_role;
