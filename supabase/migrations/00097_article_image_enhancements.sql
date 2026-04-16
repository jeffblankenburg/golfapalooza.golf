-- Migration: Article featured image enhancements
-- Adds direct image URL support (upload/song artwork), image source tracking, and focal point positioning

-- Direct URL for non-gallery images (uploads, song artwork)
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS featured_image_url TEXT;

-- Track where the featured image came from
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS featured_image_source VARCHAR(20) DEFAULT 'gallery';
ALTER TABLE public.articles ADD CONSTRAINT articles_featured_image_source_check
  CHECK (featured_image_source IN ('gallery', 'upload', 'song_art'));

-- Focal point as percentage (0-100), default center
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS featured_image_focal_x SMALLINT DEFAULT 50;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS featured_image_focal_y SMALLINT DEFAULT 50;
