-- Every event carries an IANA timezone (e.g. 'America/New_York').
--
-- start_date + start_time are a WALL-CLOCK time in this zone; the app resolves the
-- absolute instant from it so the countdown (and any future time-sensitive view)
-- is identical for every viewer regardless of where THEY are. Previously times
-- were interpreted in the viewer's local zone, which was wrong for anyone not in
-- the event's region. NOT NULL with a platform default so every row has one;
-- admins set it per event (the create form pre-fills the organizer's detected
-- zone). DST is handled by storing the zone name, never a fixed offset.

ALTER TABLE public.v2_events
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/New_York';
