-- ============================================================
-- Phase 1a of the historical import (issue #114): unify the
-- schema so 28 years of historical accolades land in the same
-- tables we use for live trips.
--
-- Schema only — no data writes. Trip seeding and accolade
-- import are separate, idempotent scripts/admin tools.
-- ============================================================

-- 1. Workbook join key on users. The historical XLSX uses
--    `FirstNameLastName` (e.g. `JeffBlankenburg`) as its ID.
--    We persist that mapping on each users row so re-runs of
--    the importer find the same user.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS workbook_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_workbook_name
  ON public.users (workbook_name)
  WHERE workbook_name IS NOT NULL;

COMMENT ON COLUMN public.users.workbook_name IS
  'FirstNameLastName join key from the historical Golfapalooza workbook (issue #114). Used by the history importer to match award winners and round players to user rows. NULL for users not represented in the workbook.';

-- 2. Canonicalize Golfapalooza award categories on the
--    existing accolades table. Existing rows default to
--    `custom` so this is fully backward compatible.
ALTER TABLE public.accolades
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'custom';

ALTER TABLE public.accolades
  DROP CONSTRAINT IF EXISTS accolades_category_check;

ALTER TABLE public.accolades
  ADD CONSTRAINT accolades_category_check
  CHECK (category IN (
    'mvl',
    'roy',
    'melc',
    'bspitw',
    'green_jacket',
    'cornhole_singles',
    'cornhole_doubles',
    'custom'
  ));

COMMENT ON COLUMN public.accolades.category IS
  'Canonical award type. mvl=Most Valuable Loozer, roy=Rookie of the Year, melc=Most Embarrassing Loozer Cup, bspitw=Best Shot Played In The World, green_jacket=Scramble champion, cornhole_singles/cornhole_doubles=cornhole champs. custom=admin-defined per-trip honor.';

-- 3. Doubles cornhole has two winners per trip. Capture the
--    partner separately so a single accolades row represents
--    the team.
ALTER TABLE public.accolades
  ADD COLUMN IF NOT EXISTS partner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.accolades.partner_user_id IS
  'Cornhole doubles partner (NULL for non-doubles awards or when the partner is unknown). Order does not matter — both teammates are equal winners.';

-- 4. Idempotency for the importer: same person can't win the
--    same canonical award twice in the same trip. (Custom
--    accolades remain unconstrained — admins might legitimately
--    award the same person multiple custom honors per trip.)
--    NULL partner_user_id is normalized to a sentinel so it
--    participates in the uniqueness check.
CREATE UNIQUE INDEX IF NOT EXISTS uq_accolades_canonical_winner
  ON public.accolades (
    trip_id,
    category,
    user_id,
    COALESCE(partner_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE category <> 'custom';
