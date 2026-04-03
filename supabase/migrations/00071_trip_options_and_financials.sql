-- Trip Options & Financial Ledger
-- Options: per-trip configurable selections (with optional costs)
-- Financials: lifetime user-scoped ledger (charges & payments)

-- ===========================================
-- 1. option_groups
-- ===========================================
CREATE TABLE IF NOT EXISTS public.option_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_option_groups_trip ON public.option_groups(trip_id);

ALTER TABLE public.option_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read option_groups"
  ON public.option_groups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage option_groups"
  ON public.option_groups FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER option_groups_updated_at
  BEFORE UPDATE ON public.option_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- 2. trip_options
-- ===========================================
CREATE TABLE IF NOT EXISTS public.trip_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.option_groups(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  option_type VARCHAR(20) NOT NULL CHECK (option_type IN ('checkbox', 'select', 'multi_select', 'text', 'number')),
  choices JSONB,        -- For select/multi_select: [{label, value, cost}]
  cost NUMERIC(10,2),   -- For checkbox: flat cost when selected
  is_required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trip_options_group ON public.trip_options(group_id);
CREATE INDEX idx_trip_options_trip ON public.trip_options(trip_id);

ALTER TABLE public.trip_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read trip_options"
  ON public.trip_options FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage trip_options"
  ON public.trip_options FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER trip_options_updated_at
  BEFORE UPDATE ON public.trip_options
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- 3. user_option_selections
-- ===========================================
CREATE TABLE IF NOT EXISTS public.user_option_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES public.trip_options(id) ON DELETE CASCADE,
  value JSONB NOT NULL,  -- true/false, "value", ["val1","val2"], "text", number
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, option_id)
);

CREATE INDEX idx_user_option_selections_trip ON public.user_option_selections(trip_id);
CREATE INDEX idx_user_option_selections_user ON public.user_option_selections(user_id);
CREATE INDEX idx_user_option_selections_option ON public.user_option_selections(option_id);

ALTER TABLE public.user_option_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own selections"
  ON public.user_option_selections FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Users can manage their own selections"
  ON public.user_option_selections FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Users can update their own selections"
  ON public.user_option_selections FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Users can delete their own selections"
  ON public.user_option_selections FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER user_option_selections_updated_at
  BEFORE UPDATE ON public.user_option_selections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- 4. trip_option_settings
-- ===========================================
CREATE TABLE IF NOT EXISTS public.trip_option_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  selection_deadline TIMESTAMPTZ,
  is_open BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_id)
);

ALTER TABLE public.trip_option_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read trip_option_settings"
  ON public.trip_option_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage trip_option_settings"
  ON public.trip_option_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER trip_option_settings_updated_at
  BEFORE UPDATE ON public.trip_option_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- 5. financial_transactions
-- ===========================================
CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES public.trip_settings(id) ON DELETE SET NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('charge', 'payment')),
  source VARCHAR(20) NOT NULL CHECK (source IN ('option', 'manual', 'adjustment')),
  option_id UUID REFERENCES public.trip_options(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  method VARCHAR(20),  -- cash, venmo, check, zelle, other (for payments)
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_financial_transactions_user ON public.financial_transactions(user_id);
CREATE INDEX idx_financial_transactions_trip ON public.financial_transactions(trip_id);
CREATE INDEX idx_financial_transactions_option ON public.financial_transactions(option_id) WHERE option_id IS NOT NULL;

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own transactions"
  ON public.financial_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can manage financial_transactions"
  ON public.financial_transactions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));
