-- Issue #103 Phase 2 — payout grid paid-status tracker
-- Generic per-cell "paid" flag. The grid renders one cell per (Loozer, event)
-- intersection where a winner exists; this table records whether Sheiker has
-- handed over the cash for that cell. Pickem keeps using `pickem_payouts`
-- (read-through, never written here) so existing flows aren't disturbed.
--
-- cell_key is a soft string identifier. Format examples:
--   scramble_team:<contest_id>:1     — 1st place team payout for that scramble
--   scramble_team:<contest_id>:2     — 2nd place team payout
--   scramble_skins:<contest_id>      — skins payout for that scramble
--   daily:<day>:<type>               — e.g. daily:2:ctp_front, daily:3:long_drive
--   hundred_feet                     — event-level 100 ft. winner

CREATE TABLE IF NOT EXISTS public.payout_paid_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  cell_key VARCHAR(100) NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (trip_id, user_id, cell_key)
);

CREATE INDEX IF NOT EXISTS idx_payout_paid_status_trip
  ON public.payout_paid_status(trip_id);

ALTER TABLE public.payout_paid_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read payout_paid_status"
  ON public.payout_paid_status FOR SELECT TO authenticated USING (true);

CREATE POLICY "Finance admins can manage payout_paid_status"
  ON public.payout_paid_status FOR ALL TO authenticated
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

CREATE TRIGGER payout_paid_status_updated_at
  BEFORE UPDATE ON public.payout_paid_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
