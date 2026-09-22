-- 00236_v2_courses_locked.sql
-- Admin lock toggle for the universal v2 course library (#194, v1 parity with #133).
-- By default any signed-in member may edit any course (universal edit). Locking a
-- course freezes it so only group admins can edit — used to protect a canonical /
-- verified course from further changes.
--
-- Access is enforced in the API layer (all course writes go through the service-role
-- client, which bypasses RLS), mirroring how course DELETE is already gated on
-- isAnyOrgAdmin. This migration only adds the flag.

ALTER TABLE public.v2_courses
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false;

-- Existing table (grants from 00209); no new grant required.
