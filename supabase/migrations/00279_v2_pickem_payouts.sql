-- 00279_v2_pickem_payouts.sql
--
-- Pick'em winnings-paid tracking (issue #5b). Pick'em pays by LEADERBOARD PLACE
-- (one amount per winner for the whole contest), not per-game like Squares, so this
-- is a single row per (contest, member) — mirror of v2_squares_payouts without the
-- game dimension. Tracks EXTERNAL cash-outs (Venmo / PayPal): paid_cents + method +
-- note. The third payout method, "Apply to account", does NOT write here — it posts
-- a source='winnings' credit to v2_financial_transactions so it offsets the member's
-- balance. A winner's settled total is the sum of BOTH stores.
--
-- Nothing real is paid in v2 yet, so a destructive recreate is safe.

DROP TABLE IF EXISTS public.v2_pickem_payouts CASCADE;
CREATE TABLE public.v2_pickem_payouts (
  contest_id UUID NOT NULL REFERENCES public.v2_contests(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  paid_cents INT NOT NULL DEFAULT 0,
  method     TEXT,                 -- 'Venmo' | 'PayPal' (free-text note of how)
  note       TEXT,
  paid_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_by    UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (contest_id, user_id)
);
CREATE INDEX v2_pickem_payouts_contest_idx ON public.v2_pickem_payouts (contest_id);

ALTER TABLE public.v2_pickem_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_pickem_payouts_all" ON public.v2_pickem_payouts FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_pickem_payouts TO authenticated, service_role;
