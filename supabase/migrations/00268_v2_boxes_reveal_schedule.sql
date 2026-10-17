-- Per-game number reveals (#230). Instead of one draw that locks all games at
-- once, each game's numbers are revealed on their own schedule — manually by the
-- admin ("Reveal now") or automatically when `reveal_at` passes (a cron rolls the
-- digits). Default `reveal_at` is a week before kickoff, seeded when the board is
-- locked; the admin can edit it per game. A revealed game has `locked_at` + digits
-- set (one-shot, irreversible); an unrevealed game shows placeholders. NULL
-- `reveal_at` = no schedule (reveal by hand only). Integrity is unchanged: each
-- game is still a one-shot, server-rolled permutation that can never be re-rolled.
ALTER TABLE public.v2_boxes_games ADD COLUMN IF NOT EXISTS reveal_at TIMESTAMPTZ;
