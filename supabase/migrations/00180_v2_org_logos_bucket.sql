-- Storage bucket for v2 organization logos. Public-read so logos display and can
-- skin the app before auth (matches the public-readable org branding rows).
-- Writes happen ONLY via the service role inside /api/v2 (gated by org-admin
-- membership checks), so no authenticated storage.objects write policies are
-- needed — a public bucket serves reads via public URL regardless of RLS.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'v2-org-logos',
  'v2-org-logos',
  true,
  5242880, -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;
