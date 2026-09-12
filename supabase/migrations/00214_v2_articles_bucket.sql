-- Storage bucket for v2 article images (hero images). Public-read so images
-- display without auth (matches published-article visibility). Writes happen
-- ONLY via the service role inside /api/v2/articles/upload-image, gated by the
-- manage_articles permission (or org-admin) — so no authenticated storage.objects
-- write policies are needed; a public bucket serves reads via public URL.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'v2-articles',
  'v2-articles',
  true,
  10485760, -- 10 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;
