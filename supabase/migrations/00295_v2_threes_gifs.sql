-- 00295_v2_threes_gifs.sql
--
-- #246: a per-org GIF library for the 3s and Ds big board. Admins upload GIFs
-- once, then assign several to each event's reaction; the board picks one at
-- random on each tap. Reactions still store the chosen GIF URLs inline (so the
-- board needs no library lookup) — this table is the manage-time picker source.

DROP TABLE IF EXISTS public.v2_3s_gifs CASCADE;
CREATE TABLE public.v2_3s_gifs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,   -- public URL in the v2-threes-gifs bucket
  path        TEXT NOT NULL,   -- storage path, for deletion cleanup
  label       TEXT,
  created_by  UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_3s_gifs_org ON public.v2_3s_gifs(org_id, created_at DESC);

ALTER TABLE public.v2_3s_gifs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_3s_gifs_all" ON public.v2_3s_gifs FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_3s_gifs TO authenticated, service_role;

-- Public-read bucket for the GIFs; writes go through the service role / signed
-- upload URLs inside /api/v2/orgs/[id]/threes-gifs (admin-gated).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'v2-threes-gifs',
  'v2-threes-gifs',
  true,
  15728640, -- 15 MB (GIFs are chunky)
  ARRAY['image/gif', 'image/webp', 'image/png', 'image/jpeg', 'video/mp4']
)
ON CONFLICT (id) DO NOTHING;
