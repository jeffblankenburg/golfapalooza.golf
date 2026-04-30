-- ============================================================
-- Optional badge images for accolade categories. When `icon_url`
-- is set, surfaces render the image instead of the emoji `icon`.
-- The emoji is preserved as a fallback (for places where image
-- loading isn't ideal — push notifications, plain text, etc.).
-- ============================================================

ALTER TABLE public.accolade_categories
  ADD COLUMN IF NOT EXISTS icon_url TEXT;

COMMENT ON COLUMN public.accolade_categories.icon_url IS
  'Public URL of an uploaded badge image. Renders in place of the emoji icon when set.';

-- Storage bucket for badge images. Public read (badges show on the public
-- /accolades and /spectator/accolades pages); admin-only write/update/delete.
INSERT INTO storage.buckets (id, name, public)
VALUES ('accolade-badges', 'accolade-badges', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view accolade badges" ON storage.objects;
CREATE POLICY "Anyone can view accolade badges"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'accolade-badges');

DROP POLICY IF EXISTS "Admins can upload accolade badges" ON storage.objects;
CREATE POLICY "Admins can upload accolade badges"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'accolade-badges'
    AND EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid()) AND is_admin = true)
  );

DROP POLICY IF EXISTS "Admins can update accolade badges" ON storage.objects;
CREATE POLICY "Admins can update accolade badges"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'accolade-badges'
    AND EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid()) AND is_admin = true)
  );

DROP POLICY IF EXISTS "Admins can delete accolade badges" ON storage.objects;
CREATE POLICY "Admins can delete accolade badges"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'accolade-badges'
    AND EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid()) AND is_admin = true)
  );
