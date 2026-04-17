-- Move eight_bag_average and avg_scramble_score onto the users table
-- These are user-level metrics like handicap, not event-scoped

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS eight_bag_average NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS avg_scramble_score NUMERIC(4,1);

-- Migrate latest values from user_scramble_stats (most recently updated per user)
UPDATE public.users u
SET
  eight_bag_average = sub.eight_bag_average,
  avg_scramble_score = sub.avg_scramble_score
FROM (
  SELECT DISTINCT ON (user_id)
    user_id, eight_bag_average, avg_scramble_score
  FROM public.user_scramble_stats
  ORDER BY user_id, updated_at DESC
) sub
WHERE u.id = sub.user_id;
