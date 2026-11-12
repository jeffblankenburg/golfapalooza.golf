-- 00291_v2_props_question_media.sql
--
-- #243: let a Props question carry an optional image or GIF (great for the novelty props —
-- a still from the broadcast, a reaction GIF, the Gatorade cooler, etc.). The URL is either a
-- GIPHY result (hotlinked) or an admin upload stored in the public v2-props bucket below.

ALTER TABLE public.v2_prop_questions ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Public-read bucket for Props question media. Writes happen ONLY via the service role inside
-- /api/v2/orgs/{id}/contests/{contestId}/props/upload, gated by org-admin — so no authenticated
-- storage.objects write policies are needed; a public bucket serves reads via public URL.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'v2-props',
  'v2-props',
  true,
  10485760, -- 10 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;
