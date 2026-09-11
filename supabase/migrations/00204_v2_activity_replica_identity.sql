-- REPLICA IDENTITY FULL so realtime DELETE events on v2_activity include the full
-- old row (esp. org_id). Without it, the deleted row carries only the PK, so an
-- RLS-scoped / org-filtered postgres_changes DELETE subscription never receives
-- it — and the home Activity feed can't drop a row live when its photo is deleted.
-- (Mirrors 00197 for chat reactions.)

ALTER TABLE public.v2_activity REPLICA IDENTITY FULL;
