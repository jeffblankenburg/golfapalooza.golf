-- Fix contest_participants.owner_id FK to SET NULL on user deletion
-- Currently defaults to RESTRICT, which would block deleting a user who owns a Calcutta entry.

ALTER TABLE public.contest_participants
  DROP CONSTRAINT IF EXISTS contest_participants_owner_id_fkey;

ALTER TABLE public.contest_participants
  ADD CONSTRAINT contest_participants_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;
