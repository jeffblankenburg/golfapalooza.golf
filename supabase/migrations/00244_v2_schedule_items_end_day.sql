-- Optional end date for schedule items (#208). `day` is the start date (required);
-- `end_day` (nullable) makes an item span multiple days (a room block, a
-- registration window, a multi-day competition). NULL = single-day item.

ALTER TABLE public.v2_schedule_items ADD COLUMN IF NOT EXISTS end_day DATE;
