-- Guest players on a round.
--
-- Sometimes a group includes people who aren't Loozers (no app account). We
-- still want to keep their scores/putts and show their scorecard. Per-hole
-- scores already key off round_players.id (not user_id), so a guest only needs
-- a roster row whose user_id is NULL and a display name in guest_name.
--
-- Guests are intentionally unattached to any current OR future user account:
-- there is no backfill/claim path. They have no handicap and never enter
-- handicap calculations (enforced in the API layer, which skips diff/adjusted
-- math for rows with a NULL user_id).

-- user_id becomes optional; guest_name carries the typed-in name.
ALTER TABLE public.round_players ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.round_players ADD COLUMN IF NOT EXISTS guest_name VARCHAR(100);

-- Every roster row is EITHER a real user OR a named guest — never both, never
-- neither. Existing rows (user_id set, guest_name NULL) already satisfy this.
ALTER TABLE public.round_players DROP CONSTRAINT IF EXISTS round_players_user_xor_guest;
ALTER TABLE public.round_players ADD CONSTRAINT round_players_user_xor_guest
  CHECK (
    (user_id IS NOT NULL AND guest_name IS NULL)
    OR (user_id IS NULL AND guest_name IS NOT NULL)
  );

-- The original UNIQUE(round_id, user_id) enforced one row per Loozer. Guests
-- have a NULL user_id (and multiple guests per round are allowed), so swap the
-- table constraint for a partial unique index that ignores guest rows.
ALTER TABLE public.round_players DROP CONSTRAINT IF EXISTS round_players_round_id_user_id_key;
DROP INDEX IF EXISTS round_players_round_user_unique;
CREATE UNIQUE INDEX round_players_round_user_unique
  ON public.round_players(round_id, user_id)
  WHERE user_id IS NOT NULL;

-- round_players predates the Oct-2026 grant requirement and is already exposed
-- to authenticated/service_role; ALTER doesn't change grants, so none needed.
