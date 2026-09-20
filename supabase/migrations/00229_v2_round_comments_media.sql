-- 00229_v2_round_comments_media.sql
-- Give round comments chat parity: an optional image (uploaded photo OR a GIF
-- URL). Mentions ride inside `body` using the same @[Name](id) wire format chat
-- uses, so no extra column is needed. Body becomes optional (image-only
-- comments), but a comment must carry a body or an image.

ALTER TABLE public.v2_round_comments ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.v2_round_comments ALTER COLUMN body DROP NOT NULL;

-- Swap the old "body length 1..500 NOT NULL" check for one that also permits an
-- image-only comment.
ALTER TABLE public.v2_round_comments DROP CONSTRAINT IF EXISTS v2_round_comments_body_check;
ALTER TABLE public.v2_round_comments DROP CONSTRAINT IF EXISTS v2_round_comments_content_check;
ALTER TABLE public.v2_round_comments ADD CONSTRAINT v2_round_comments_content_check
  CHECK (
    (body IS NOT NULL AND length(body) > 0 AND length(body) <= 500)
    OR image_url IS NOT NULL
  );
