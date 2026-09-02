-- Boland Bet payout tracking. One row per (trip, winner) that Pat Boland has
-- paid out. Presence of a row = that winner has been paid; toggling "unpaid"
-- deletes the row. Only ever written by the user identified as Boland (enforced
-- in the API via the service-role admin client), but exposed for read parity.

DROP TABLE IF EXISTS public.boland_bet_payments;

CREATE TABLE public.boland_bet_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  paid_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_id, user_id)
);

CREATE INDEX idx_boland_bet_payments_trip ON public.boland_bet_payments(trip_id);

ALTER TABLE public.boland_bet_payments ENABLE ROW LEVEL SECURITY;

-- Reads for parity; the app reads/writes exclusively via the service-role admin
-- client, and writes are gated to Boland in the API layer.
DROP POLICY IF EXISTS "boland_bet_payments_select" ON public.boland_bet_payments;
CREATE POLICY "boland_bet_payments_select" ON public.boland_bet_payments FOR SELECT
  TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.boland_bet_payments TO authenticated, service_role;
