-- Boxes payout sheet (#230). Store the admin-entered cumulative score at each
-- period end per game, so the app can compute who won each period + how much to
-- pay each person (payouts are MANUAL — the app only tells the admin the numbers).
-- Shape: { "Q1": { "away": 7, "home": 10 }, "Half": {...}, ... }
ALTER TABLE public.v2_boxes_games ADD COLUMN IF NOT EXISTS period_scores JSONB;
