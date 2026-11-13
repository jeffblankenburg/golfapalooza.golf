-- 00297_v2_threes_settings.sql
--
-- #246: 3s and Ds reaction config is a GROUP-level setting, not per-game. Admins
-- set up their animations / sounds / GIF picks / max-streak once, and every
-- future game uses that configuration (changing it applies to all games going
-- forward). Previously this lived in each contest's `config` JSONB, which meant
-- re-doing it for every game — unlikely to ever happen.
--
-- One row per org. Absence of a row = app defaults (default animations, no GIFs,
-- bundled cash-register sound, streak cap 5). `streak_cap` NULL = no cap.

DROP TABLE IF EXISTS public.v2_3s_settings CASCADE;
CREATE TABLE public.v2_3s_settings (
  org_id      UUID PRIMARY KEY REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  reactions   JSONB NOT NULL DEFAULT '{}'::jsonb, -- ThreesReactions map (per-event + streak_break)
  streak_cap  INTEGER DEFAULT 5,                  -- NULL = no cap; positive int otherwise
  updated_by  UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT v2_3s_settings_cap_positive CHECK (streak_cap IS NULL OR streak_cap >= 1)
);

ALTER TABLE public.v2_3s_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_3s_settings_all" ON public.v2_3s_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_3s_settings TO authenticated, service_role;

-- Carry forward any config an admin already saved on an existing 3s_and_ds
-- contest, so nobody loses a setup they built under the old per-game model.
-- (Takes the most-recently-updated contest per org that actually has reactions.)
INSERT INTO public.v2_3s_settings (org_id, reactions, streak_cap, updated_at)
SELECT DISTINCT ON (c.org_id)
  c.org_id,
  COALESCE(c.config -> 'reactions', '{}'::jsonb),
  CASE
    WHEN c.config ? 'streakCap' AND jsonb_typeof(c.config -> 'streakCap') = 'null' THEN NULL
    WHEN c.config ? 'streakCap' THEN (c.config ->> 'streakCap')::int
    ELSE 5
  END,
  NOW()
FROM public.v2_contests c
WHERE c.contest_type = '3s_and_ds'
  AND c.config ? 'reactions'
  AND jsonb_typeof(c.config -> 'reactions') = 'object'
ORDER BY c.org_id, c.updated_at DESC NULLS LAST
ON CONFLICT (org_id) DO NOTHING;
