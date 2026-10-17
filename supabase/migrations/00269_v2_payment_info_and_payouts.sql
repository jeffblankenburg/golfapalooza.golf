-- Member payment info + Boxes payout paid-tracking (#230). Members store how they
-- want to be paid (self-service, in their profile); admins use it on the pool's
-- master payouts page to generate prefilled Venmo/PayPal links, with a mailing
-- address as the mail-a-check fallback. Payment details are private — only the
-- member and admins ever read them.
ALTER TABLE public.v2_profiles ADD COLUMN IF NOT EXISTS venmo_username TEXT;
ALTER TABLE public.v2_profiles ADD COLUMN IF NOT EXISTS paypal_username TEXT;
ALTER TABLE public.v2_profiles ADD COLUMN IF NOT EXISTS mailing_address TEXT;

-- Who's been paid, and how much, per pool. `paid_cents` records the amount paid
-- (not just a flag) so that if more winnings accrue after payment — a later game
-- reveals/completes — the page can show the remaining balance owed rather than
-- going stale. One row per (pool, member).
DROP TABLE IF EXISTS public.v2_boxes_payouts CASCADE;
CREATE TABLE public.v2_boxes_payouts (
  contest_id UUID NOT NULL REFERENCES public.v2_contests(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  paid_cents INT NOT NULL DEFAULT 0,
  paid_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_by    UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (contest_id, user_id)
);
ALTER TABLE public.v2_boxes_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_boxes_payouts_all" ON public.v2_boxes_payouts FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_boxes_payouts TO authenticated, service_role;
