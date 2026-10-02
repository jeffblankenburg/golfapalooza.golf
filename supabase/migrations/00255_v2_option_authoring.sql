-- 00255_v2_option_authoring.sql
-- Rebuild v2 options to full v1 parity (#218, expands #216). Structure is
-- Groups → Options (7 types) → Choices, with cost_items linked per choice,
-- dependencies, required/limits, icons, and an open/closed selection window.
-- v2_options only holds slice-1 test data, so we rework it in place.

-- ── Option groups (sections) ────────────────────────────────────────────────
DROP TABLE IF EXISTS public.v2_option_groups CASCADE;
CREATE TABLE public.v2_option_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES public.v2_events(id)        ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_option_groups_event ON public.v2_option_groups(event_id, sort_order);

-- ── Expand v2_options to the full type system ───────────────────────────────
ALTER TABLE public.v2_options DROP CONSTRAINT IF EXISTS v2_options_option_type_check;
ALTER TABLE public.v2_options
  ADD COLUMN IF NOT EXISTS group_id             UUID REFERENCES public.v2_option_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS choices              JSONB,
  ADD COLUMN IF NOT EXISTS is_required          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_total            INTEGER,
  ADD COLUMN IF NOT EXISTS icon                 TEXT,
  ADD COLUMN IF NOT EXISTS depends_on_option_id UUID REFERENCES public.v2_options(id) ON DELETE SET NULL;
ALTER TABLE public.v2_options
  ADD CONSTRAINT v2_options_option_type_check
  CHECK (option_type IN ('checkbox','select','multi_select','quantity','text','number','trip_cost'));
CREATE INDEX IF NOT EXISTS idx_v2_options_group ON public.v2_options(group_id);

-- choices JSONB shape: [{ "label": str, "value": slug, "cost"?: cents, "contest_id"?: uuid }]
-- (cost is a display fallback; real price derives from linked cost_items.)

-- ── Which cost_item funds which choice (per-choice linking) ─────────────────
-- Empty for an option = the cost applies to the whole option (checkbox / default).
DROP TABLE IF EXISTS public.v2_cost_item_option_choices CASCADE;
CREATE TABLE public.v2_cost_item_option_choices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_item_id UUID NOT NULL REFERENCES public.v2_cost_items(id) ON DELETE CASCADE,
  choice_value TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cost_item_id, choice_value)
);
CREATE INDEX idx_v2_cio_cost_item ON public.v2_cost_item_option_choices(cost_item_id);

-- ── Selections gain a value (type-specific) ─────────────────────────────────
-- true | "choiceValue" | ["v1","v2"] | {"choice": qty}. Existing checkbox rows → true.
ALTER TABLE public.v2_user_option_selections
  ADD COLUMN IF NOT EXISTS value JSONB NOT NULL DEFAULT 'true'::jsonb;

-- ── Per-event option settings (deadline + open/closed) ──────────────────────
DROP TABLE IF EXISTS public.v2_event_option_settings CASCADE;
CREATE TABLE public.v2_event_option_settings (
  event_id           UUID PRIMARY KEY REFERENCES public.v2_events(id) ON DELETE CASCADE,
  selection_deadline TIMESTAMPTZ,
  is_open            BOOLEAN NOT NULL DEFAULT true,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Permissive RLS, API-gated writes (mirrors the rest of v2).
ALTER TABLE public.v2_option_groups             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_cost_item_option_choices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_event_option_settings     ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_option_groups_all"    ON public.v2_option_groups            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_cio_all"              ON public.v2_cost_item_option_choices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_event_opt_settings_all" ON public.v2_event_option_settings  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_option_groups            TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_cost_item_option_choices TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_event_option_settings    TO authenticated, service_role;
