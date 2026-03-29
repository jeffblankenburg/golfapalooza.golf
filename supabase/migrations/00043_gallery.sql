-- Migration: Photo/Video Gallery
-- Tables: gallery_items, gallery_reactions, gallery_comments, gallery_tags
-- Storage: gallery-media bucket

-- ============================================================================
-- 1. CREATE ALL TABLES
-- ============================================================================

-- Gallery Items (photos and videos)
CREATE TABLE IF NOT EXISTS public.gallery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  thumbnail_url text,
  media_type text NOT NULL CHECK (media_type IN ('photo', 'video')),
  caption text,
  width smallint,
  height smallint,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_items_trip_created
  ON public.gallery_items (trip_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gallery_items_uploader
  ON public.gallery_items (uploader_id);

-- Gallery Reactions (emoji on items)
CREATE TABLE IF NOT EXISTS public.gallery_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.gallery_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(item_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_gallery_reactions_item
  ON public.gallery_reactions (item_id);

-- Gallery Comments
CREATE TABLE IF NOT EXISTS public.gallery_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.gallery_items(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_comments_item_created
  ON public.gallery_comments (item_id, created_at ASC);

-- Gallery Tags (tag Loozers in photos/videos)
CREATE TABLE IF NOT EXISTS public.gallery_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.gallery_items(id) ON DELETE CASCADE,
  tagged_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tagger_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(item_id, tagged_user_id)
);

CREATE INDEX IF NOT EXISTS idx_gallery_tags_user
  ON public.gallery_tags (tagged_user_id);

CREATE INDEX IF NOT EXISTS idx_gallery_tags_item
  ON public.gallery_tags (item_id);

-- ============================================================================
-- 2. ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_tags ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================

-- Gallery Items
DROP POLICY IF EXISTS "Authenticated users can read gallery items" ON public.gallery_items;
CREATE POLICY "Authenticated users can read gallery items"
  ON public.gallery_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can upload gallery items" ON public.gallery_items;
CREATE POLICY "Authenticated users can upload gallery items"
  ON public.gallery_items FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = uploader_id);

DROP POLICY IF EXISTS "Uploaders and admins can delete gallery items" ON public.gallery_items;
CREATE POLICY "Uploaders and admins can delete gallery items"
  ON public.gallery_items FOR DELETE TO authenticated
  USING (
    auth.uid() = uploader_id
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

-- Gallery Reactions
DROP POLICY IF EXISTS "Authenticated users can read gallery reactions" ON public.gallery_reactions;
CREATE POLICY "Authenticated users can read gallery reactions"
  ON public.gallery_reactions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can add gallery reactions" ON public.gallery_reactions;
CREATE POLICY "Authenticated users can add gallery reactions"
  ON public.gallery_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove own gallery reactions" ON public.gallery_reactions;
CREATE POLICY "Users can remove own gallery reactions"
  ON public.gallery_reactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Gallery Comments
DROP POLICY IF EXISTS "Authenticated users can read gallery comments" ON public.gallery_comments;
CREATE POLICY "Authenticated users can read gallery comments"
  ON public.gallery_comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can add gallery comments" ON public.gallery_comments;
CREATE POLICY "Authenticated users can add gallery comments"
  ON public.gallery_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- Gallery Tags
DROP POLICY IF EXISTS "Authenticated users can read gallery tags" ON public.gallery_tags;
CREATE POLICY "Authenticated users can read gallery tags"
  ON public.gallery_tags FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can add gallery tags" ON public.gallery_tags;
CREATE POLICY "Authenticated users can add gallery tags"
  ON public.gallery_tags FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = tagger_id);

DROP POLICY IF EXISTS "Taggers and admins can remove gallery tags" ON public.gallery_tags;
CREATE POLICY "Taggers and admins can remove gallery tags"
  ON public.gallery_tags FOR DELETE TO authenticated
  USING (
    auth.uid() = tagger_id
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

-- ============================================================================
-- 4. ENABLE REALTIME
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'gallery_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gallery_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'gallery_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gallery_reactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'gallery_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gallery_comments;
  END IF;
END $$;

-- ============================================================================
-- 5. STORAGE BUCKET
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('gallery-media', 'gallery-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: all authenticated can read
CREATE POLICY "Anyone can view gallery media"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'gallery-media');

-- All authenticated users can upload
CREATE POLICY "Authenticated users can upload gallery media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'gallery-media');

-- All authenticated users can delete their own uploads (ownership enforced at API level)
CREATE POLICY "Authenticated users can delete gallery media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'gallery-media');
