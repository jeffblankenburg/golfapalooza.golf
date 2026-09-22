-- 00234_v2_membership_archived.sql
-- Per-member "archived / inactive" state for the members directory (#198).
-- A 30-year group accumulates one-time attendees (won closest-to-the-pin in year
-- 2, never came back) that admins want on the books — for accolades/history — but
-- NOT cluttering the active members list. Archived members drop into a collapsed
-- accordion at the bottom of the directory.
--
-- IMPORTANT: this is ORTHOGONAL to v2_memberships.status. `status` is load-bearing
-- for access — RLS (v2_is_org_member/admin), getPlatformContext, and isOrgMember all
-- gate on status='active'. An archived member is still status='active' (keeps access,
-- still resolvable); archived_at only affects how the directory displays them.

ALTER TABLE public.v2_memberships
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Existing table (grants from 00179); no new grant required.
