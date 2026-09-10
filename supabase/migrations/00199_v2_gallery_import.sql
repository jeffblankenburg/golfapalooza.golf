-- Import legacy gallery into v2, preserving ORIGINAL UUIDs so item/reaction/
-- comment/tag references map directly. IDEMPOTENT + RE-RUNNABLE (final re-import
-- at cutover). Media URLs point at the still-public gallery-media bucket, so they
-- keep working. All maps to the Golfapalooza org; event_id NULL. Rows referencing
-- a user not in v2_profiles are skipped for integrity.

INSERT INTO public.v2_gallery_items
  (id, org_id, uploader_id, legacy_item_id, media_url, thumbnail_url, media_type, caption, width, height, taken_at, created_at)
SELECT
  g.id, o.id, g.uploader_id, g.id, g.media_url, g.thumbnail_url, g.media_type,
  g.caption, g.width, g.height, g.taken_at, COALESCE(g.created_at, now())
FROM public.gallery_items g
CROSS JOIN (SELECT id FROM public.v2_organizations WHERE slug = 'golfapalooza' LIMIT 1) o
WHERE EXISTS (SELECT 1 FROM public.v2_profiles p WHERE p.id = g.uploader_id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.v2_gallery_reactions (id, item_id, user_id, emoji, created_at)
SELECT r.id, r.item_id, r.user_id, r.emoji, COALESCE(r.created_at, now())
FROM public.gallery_reactions r
WHERE EXISTS (SELECT 1 FROM public.v2_gallery_items i WHERE i.id = r.item_id)
  AND EXISTS (SELECT 1 FROM public.v2_profiles p WHERE p.id = r.user_id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.v2_gallery_comments (id, item_id, sender_id, content, created_at)
SELECT c.id, c.item_id, c.sender_id, c.content, COALESCE(c.created_at, now())
FROM public.gallery_comments c
WHERE EXISTS (SELECT 1 FROM public.v2_gallery_items i WHERE i.id = c.item_id)
  AND EXISTS (SELECT 1 FROM public.v2_profiles p WHERE p.id = c.sender_id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.v2_gallery_tags (id, item_id, tagged_user_id, tagger_id, created_at)
SELECT t.id, t.item_id, t.tagged_user_id, t.tagger_id, COALESCE(t.created_at, now())
FROM public.gallery_tags t
WHERE EXISTS (SELECT 1 FROM public.v2_gallery_items i WHERE i.id = t.item_id)
  AND EXISTS (SELECT 1 FROM public.v2_profiles p WHERE p.id = t.tagged_user_id)
  AND EXISTS (SELECT 1 FROM public.v2_profiles p2 WHERE p2.id = t.tagger_id)
ON CONFLICT (id) DO NOTHING;
