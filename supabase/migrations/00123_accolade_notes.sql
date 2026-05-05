-- Add an optional free-text note to each accolade so admins can record
-- the story behind a win (e.g. "rolled in a 40' putt on 18 to take it").

alter table public.accolades
  add column if not exists notes text;
