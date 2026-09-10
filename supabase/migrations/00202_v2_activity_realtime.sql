-- Publish v2_activity for realtime so the home "Activity" box updates live as
-- events are logged (RSVPs, photos, and future producers). RLS still applies —
-- subscribers only receive rows for orgs they're a member of.

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_activity;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
