-- Notify all Loozers when an article is published.
--
-- notify_on_publish — admin opt-in (editor checkbox, default true). When true,
--   the article fires ONE push to every active Loozer the first time it goes
--   live (immediately on "Publish Now", or at its scheduled time via cron).
-- notified_at — one-time tombstone set when that publish push is sent, so
--   neither the inline publish path nor the cron can double-send, and later
--   edits to an already-live article never re-notify.

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS notify_on_publish boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

-- Backfill: every article that is ALREADY published must be stamped as
-- already-notified, otherwise the first cron tick would treat the entire back
-- catalog as "due" and blast everyone with historical articles.
UPDATE public.articles
  SET notified_at = now()
  WHERE notified_at IS NULL
    AND publish_at IS NOT NULL
    AND publish_at <= now();

-- Partial index backing the cron's "due, not-yet-notified" scan.
CREATE INDEX IF NOT EXISTS idx_articles_publish_notify
  ON public.articles (publish_at)
  WHERE notified_at IS NULL AND notify_on_publish = true;

-- articles already grants SELECT/INSERT/UPDATE/DELETE to authenticated,
-- service_role (migration 00084); adding columns needs no new grant.
