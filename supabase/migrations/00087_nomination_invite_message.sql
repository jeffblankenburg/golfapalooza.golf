-- Add invite_message column to rookie_nominations
alter table public.rookie_nominations
  add column if not exists invite_message text;
