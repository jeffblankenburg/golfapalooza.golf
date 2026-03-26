-- Set the first user as admin (bootstrap)
-- This updates all existing users to admin since we need at least one admin to manage the system
-- After this, admin status can be toggled from the admin UI

UPDATE public.users
SET is_admin = true
WHERE id = (SELECT id FROM public.users ORDER BY created_at ASC LIMIT 1);
