-- Storage bucket for v2 soundboard clips + icon images. Public-read so operators
-- play clips instantly and receivers play a blasted clip straight from its public
-- URL (carried in the broadcast payload) with no catalog read. Writes happen ONLY
-- via the service role / signed upload URLs inside /api/v2/soundboard (gated by
-- manage_soundboard), so no authenticated storage.objects write policies are needed.
--
-- Clips are short; 5 MB is generous. Audio lands under {orgId}/audio/, icon
-- images under {orgId}/images/.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'v2-soundboard',
  'v2-soundboard',
  true,
  5242880, -- 5 MB (a short clip)
  ARRAY[
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm',
    'image/png', 'image/jpeg', 'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;
