-- Track whether prize winners have been paid out
DROP TABLE IF EXISTS pickem_payouts;

CREATE TABLE pickem_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paid_out BOOLEAN NOT NULL DEFAULT false,
  paid_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contest_id, user_id)
);

CREATE INDEX idx_pickem_payouts_contest ON pickem_payouts(contest_id);

ALTER TABLE pickem_payouts ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view payout status
CREATE POLICY "Authenticated users can view pickem payouts"
  ON pickem_payouts FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can manage payouts
CREATE POLICY "Admins can manage pickem payouts"
  ON pickem_payouts FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );
