-- 00235_v2_archived_blocks_access.sql
-- Archived members lose access (#198). Per the product decision, an archived
-- member should NOT be able to use the group — they're kept only for the historical
-- record and shown in a collapsed directory bucket. So membership RESOLUTION now
-- excludes archived rows everywhere access is decided, while the directory (which
-- reads via the service role and filters status='active' only) keeps showing them.
--
-- archived_at stays orthogonal to `status` (the row is still status='active', so
-- the service-role directory queries still surface it) — these predicates simply
-- add `archived_at IS NULL` so an archived member resolves as "not a member" for
-- access checks (RLS + getPlatformContext + the TS helpers, updated in app code).

-- ── Membership predicates (SECURITY DEFINER; used across v2 RLS policies) ──────
CREATE OR REPLACE FUNCTION public.v2_is_org_member(p_org UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.v2_memberships m
    WHERE m.org_id = p_org AND m.user_id = auth.uid()
      AND m.status = 'active' AND m.archived_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.v2_is_org_admin(p_org UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.v2_memberships m
    WHERE m.org_id = p_org AND m.user_id = auth.uid()
      AND m.status = 'active' AND m.archived_at IS NULL AND m.role IN ('owner','admin')
  );
$$;

-- ── Profile read policy: the VIEWER must be an active, non-archived co-member.
-- (The viewed profile `them` stays unfiltered so archived members still render in
-- rosters/directory that read through the service role.)
DROP POLICY IF EXISTS "v2_profile_select_self" ON public.v2_profiles;
CREATE POLICY "v2_profile_select_self" ON public.v2_profiles FOR SELECT
  TO authenticated USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.v2_memberships me
      JOIN public.v2_memberships them ON them.org_id = me.org_id
      WHERE me.user_id = auth.uid()
        AND me.status = 'active' AND me.archived_at IS NULL
        AND them.user_id = v2_profiles.id
    )
  );
