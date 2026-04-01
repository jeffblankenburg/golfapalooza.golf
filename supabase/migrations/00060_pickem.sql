-- Whitey's Pick'em: college football pick'em contest tables

-- ===========================================
-- PICKEM GAMES (the Saturday game slate)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.pickem_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  away_team TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_logo_url TEXT,
  home_logo_url TEXT,
  away_color TEXT,
  home_color TEXT,
  spread NUMERIC(4,1) NOT NULL DEFAULT 0,
  favorite TEXT NOT NULL CHECK (favorite IN ('away', 'home')),
  game_time TIMESTAMPTZ NOT NULL,
  tv_channel TEXT,
  is_tiebreaker BOOLEAN NOT NULL DEFAULT false,
  winning_team TEXT CHECK (winning_team IN ('away', 'home')),
  away_score SMALLINT,
  home_score SMALLINT,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pickem_games_contest ON public.pickem_games(contest_id);

ALTER TABLE public.pickem_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pickem_games"
  ON public.pickem_games
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage pickem_games"
  ON public.pickem_games
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

CREATE TRIGGER pickem_games_updated_at
  BEFORE UPDATE ON public.pickem_games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- PICKEM PICKS (each user's pick per game)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.pickem_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.pickem_games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  picked_team TEXT NOT NULL CHECK (picked_team IN ('away', 'home')),
  tiebreaker_total SMALLINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, user_id)
);

CREATE INDEX idx_pickem_picks_game ON public.pickem_picks(game_id);
CREATE INDEX idx_pickem_picks_user ON public.pickem_picks(user_id);

ALTER TABLE public.pickem_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pickem_picks"
  ON public.pickem_picks
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage pickem_picks"
  ON public.pickem_picks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

CREATE TRIGGER pickem_picks_updated_at
  BEFORE UPDATE ON public.pickem_picks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- PICKEM SETTINGS (contest-level config)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.pickem_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL UNIQUE REFERENCES public.contests(id) ON DELETE CASCADE,
  entry_fee NUMERIC(8,2) DEFAULT 0,
  payout_json JSONB DEFAULT '[]'::jsonb,
  is_open BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pickem_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pickem_settings"
  ON public.pickem_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage pickem_settings"
  ON public.pickem_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

CREATE TRIGGER pickem_settings_updated_at
  BEFORE UPDATE ON public.pickem_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- PICKEM PAYMENTS (who has paid)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.pickem_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contest_id, user_id)
);

ALTER TABLE public.pickem_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pickem_payments"
  ON public.pickem_payments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage pickem_payments"
  ON public.pickem_payments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

-- Seed: auto-create pickem contest + settings for active trip
DO $$
DECLARE
  v_trip_id UUID;
  v_contest_id UUID;
BEGIN
  SELECT id INTO v_trip_id FROM public.trip_settings
  WHERE status = 'active' LIMIT 1;

  IF v_trip_id IS NOT NULL THEN
    -- Create pickem contest if not exists
    SELECT id INTO v_contest_id FROM public.contests
    WHERE trip_id = v_trip_id AND contest_type = 'pickem' LIMIT 1;

    IF v_contest_id IS NULL THEN
      INSERT INTO public.contests (trip_id, name, contest_type, day_number, sort_order)
      VALUES (v_trip_id, 'Whitey''s Pick''em', 'pickem', NULL, 8)
      RETURNING id INTO v_contest_id;
    END IF;

    -- Create default settings
    INSERT INTO public.pickem_settings (contest_id, entry_fee, payout_json)
    VALUES (v_contest_id, 20, '[{"place":1,"amount":0},{"place":2,"amount":0},{"place":3,"amount":0}]'::jsonb)
    ON CONFLICT (contest_id) DO NOTHING;
  END IF;
END $$;
