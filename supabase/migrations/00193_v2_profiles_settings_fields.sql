-- Give v2_profiles the editable profile fields from the legacy ProfileEditor so
-- users can configure the same settings in v2. Backfilled from public.users
-- (same id space). font_scale is intentionally OMITTED — v2 inherits the device
-- OS text size instead (see /new layout), a deliberate divergence.

ALTER TABLE public.v2_profiles
  ADD COLUMN IF NOT EXISTS occupation    TEXT,
  ADD COLUMN IF NOT EXISTS city          TEXT,
  ADD COLUMN IF NOT EXISTS state         TEXT,
  ADD COLUMN IF NOT EXISTS playing_since SMALLINT,
  ADD COLUMN IF NOT EXISTS swings        TEXT,
  ADD COLUMN IF NOT EXISTS typical_shot  TEXT,
  ADD COLUMN IF NOT EXISTS shirt_size    TEXT,
  ADD COLUMN IF NOT EXISTS fun_fact      TEXT,
  ADD COLUMN IF NOT EXISTS best_shot     TEXT,
  ADD COLUMN IF NOT EXISTS show_on_map   BOOLEAN NOT NULL DEFAULT true;

-- Enrich existing (migrated) profiles with these fields from legacy, without
-- clobbering anything already set in v2.
UPDATE public.v2_profiles p
SET occupation    = COALESCE(p.occupation,    u.occupation),
    city          = COALESCE(p.city,          u.city),
    state         = COALESCE(p.state,         u.state),
    playing_since = COALESCE(p.playing_since,  u.playing_since),
    swings        = COALESCE(p.swings,        u.swings),
    typical_shot  = COALESCE(p.typical_shot,  u.typical_shot),
    shirt_size    = COALESCE(p.shirt_size,    u.shirt_size),
    fun_fact      = COALESCE(p.fun_fact,      u.fun_fact),
    best_shot     = COALESCE(p.best_shot,     u.best_shot),
    show_on_map   = COALESCE(u.show_on_map,   p.show_on_map)
FROM public.users u
WHERE u.id = p.id;
