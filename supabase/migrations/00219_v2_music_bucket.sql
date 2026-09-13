-- Storage bucket for v2 jukebox audio + album art. Public-read so tracks stream
-- and artwork displays without auth (matches the member-readable music library).
-- Writes happen ONLY via the service role / signed upload URLs inside /api/v2/music
-- (gated by manage_music), so no authenticated storage.objects write policies are
-- needed — a public bucket serves reads via public URL.
--
-- Legacy v2 songs (imported in 00201) still point at the old public `songs`
-- bucket and keep working; NEW v2 uploads land here, org-scoped.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'v2-music',
  'v2-music',
  true,
  73400320, -- 70 MB (a long MP3)
  ARRAY[
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/x-m4a',
    'image/png', 'image/jpeg', 'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;
