-- Tracks which birthday auto-posts have already been made to which chat rooms
-- in a given year. The composite primary key guarantees idempotency if the
-- cron fires more than once per day.
--
-- Only the cron writes here (via admin/service-role client) and nothing
-- client-side reads it, so RLS is enabled with no policies — all anon and
-- authenticated access is denied by default, while the service role still
-- bypasses RLS.

CREATE TABLE IF NOT EXISTS public.birthday_posts (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  year INT NOT NULL,
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, year, room_id)
);

ALTER TABLE public.birthday_posts ENABLE ROW LEVEL SECURITY;
