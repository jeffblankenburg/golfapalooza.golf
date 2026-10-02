-- 00253_v2_options_and_ledger.sql
-- Options layer + per-member ledger (#216, epic #214). Realizes #213's phases 3–4.
--
-- Model: the member-facing money unit is the OPTION — an all-or-nothing opt-in that
-- may bundle many contests (e.g. "Closest to the Pin" = $15 covering 6 daily CTP
-- contests). An option's PRICE is DERIVED from the cost_items linked to it
-- (v2_cost_items.linked_option_id), never stored. Trip Cost is the one special,
-- always-included derived "option" = SUM(cost_items WHERE included_in_trip_cost).
--
-- Charges are DERIVED (trip cost if on_roster + each selected option's current price),
-- so editing a cost_item re-prices everything automatically — no stale stored charges.
-- The ledger below stores only the non-derivable money: payments, credits, manual
-- charges, adjustments. Net balance = derived charges + manual charges − payments.

-- ── Options (member-facing opt-in bundles) ──────────────────────────────────
DROP TABLE IF EXISTS public.v2_options CASCADE;
CREATE TABLE public.v2_options (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES public.v2_events(id)        ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  -- All-or-nothing checkbox for now; richer types (select/quantity) can come later.
  option_type TEXT NOT NULL DEFAULT 'checkbox' CHECK (option_type IN ('checkbox')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_options_event ON public.v2_options(event_id, sort_order);

-- ── Member selections (which options a member opted into) ────────────────────
DROP TABLE IF EXISTS public.v2_user_option_selections CASCADE;
CREATE TABLE public.v2_user_option_selections (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES public.v2_events(id)   ON DELETE CASCADE,
  option_id  UUID NOT NULL REFERENCES public.v2_options(id)  ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (option_id, user_id)
);
CREATE INDEX idx_v2_option_selections_user ON public.v2_user_option_selections(user_id);
CREATE INDEX idx_v2_option_selections_event ON public.v2_user_option_selections(event_id);

-- ── Ledger (stores ONLY non-derivable money) ────────────────────────────────
DROP TABLE IF EXISTS public.v2_financial_transactions CASCADE;
CREATE TABLE public.v2_financial_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  event_id     UUID NOT NULL REFERENCES public.v2_events(id)        ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.v2_profiles(id)      ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('charge', 'payment')),
  -- charge sources: manual | adjustment | expense | contest_entry (à-la-carte add)
  -- payment sources: deposit | winnings | credit | adjustment
  source       TEXT NOT NULL CHECK (source IN ('manual','adjustment','expense','contest_entry','deposit','winnings','credit')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),  -- direction comes from `type`
  description  TEXT,
  method       TEXT,                                       -- cash | venmo | …
  notes        TEXT,
  created_by   UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_fin_tx_user ON public.v2_financial_transactions(user_id, event_id);

-- Permissive RLS, API-gated writes (mirrors the rest of v2). Members may read their
-- own money; the API enforces who sees what (never the full breakdown to non-admins).
ALTER TABLE public.v2_options                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_user_option_selections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_financial_transactions   ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_options_all"            ON public.v2_options                FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_option_selections_all"  ON public.v2_user_option_selections FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_fin_tx_all"             ON public.v2_financial_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_options                TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_user_option_selections TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_financial_transactions TO authenticated, service_role;
