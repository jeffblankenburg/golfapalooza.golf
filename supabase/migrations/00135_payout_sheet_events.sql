-- Issue #103 — Payout Denominations
-- Configurable per-trip "events on the cash sheet". Each row defines a column
-- on the workbook-style payout grid: a label, where the participant count
-- comes from, and how much per participant per day. Live-computed totals feed
-- both the cash-denomination calculator and (eventually) leaderboards that
-- want to show payout amounts.

CREATE TABLE IF NOT EXISTS public.payout_sheet_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  label VARCHAR(100) NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,

  -- Where the participant count comes from.
  --   option            — count of users who picked a yes/non-zero choice for an option
  --   option_value      — count of users whose selection.value is in source_filter.choice_values
  --   scramble          — count of contest_participants for the scramble contest
  --   all_attendees     — count of event_participants where on_roster=true
  --   pickem_payments   — count of pickem_payments where paid=true
  --   manual            — admin-entered fixed count (in source_filter.count)
  participant_source VARCHAR(30) NOT NULL CHECK (participant_source IN (
    'option', 'option_value', 'scramble', 'all_attendees', 'pickem_payments', 'manual'
  )),

  -- Points to a trip_option (for option/option_value), a contest (for scramble/pickem_payments),
  -- or NULL for all_attendees/manual.
  source_ref UUID,

  -- Source-specific filter / config. Examples:
  --   option_value  → {"choice_values": ["mon_tue_night_..."]}
  --   manual        → {"count": 12}
  source_filter JSONB,

  amount_per_participant NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (amount_per_participant >= 0),
  day_count SMALLINT NOT NULL DEFAULT 1 CHECK (day_count >= 1),

  -- false = cash needed to pay for the event itself, not a payout to a winner
  -- (e.g. KGB Cup entry pass-through).
  is_payout BOOLEAN NOT NULL DEFAULT true,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_sheet_events_trip
  ON public.payout_sheet_events(trip_id, sort_order);

ALTER TABLE public.payout_sheet_events ENABLE ROW LEVEL SECURITY;

-- Read: any signed-in user (consumed by leaderboards too).
CREATE POLICY "Authenticated users can read payout_sheet_events"
  ON public.payout_sheet_events FOR SELECT TO authenticated USING (true);

-- Write: finance-permitted admins only.
CREATE POLICY "Finance admins can manage payout_sheet_events"
  ON public.payout_sheet_events FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND (is_admin = true OR (permissions->>'manage_finances')::boolean = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND (is_admin = true OR (permissions->>'manage_finances')::boolean = true)
    )
  );

CREATE TRIGGER payout_sheet_events_updated_at
  BEFORE UPDATE ON public.payout_sheet_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
