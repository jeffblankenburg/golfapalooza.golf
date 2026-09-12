-- Granular per-member permissions (the "group feature admin" tier — see GH #178).
-- A group owner/admin implicitly has everything; a plain member can be granted
-- specific module permissions (e.g. manage_articles) without being a full admin.
-- Scoped per membership so a grant applies only within that org. Mirrors the
-- original's users.permissions JSONB, but per (org, user). Keys are validated
-- app-side against src/lib/v2/permissions.ts (no DB enum → no migration to add
-- a permission).

ALTER TABLE public.v2_memberships
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}';
