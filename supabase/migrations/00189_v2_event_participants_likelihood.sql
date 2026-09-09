-- Align v2 RSVP with the original model. The legacy site tracks a *likelihood*
-- percentage (event_participants.likelihood ∈ {25,50,75,99}), not a
-- going/maybe/not_going enum. 99 = "Attending" and puts the member on_roster;
-- lower values are Probable/Questionable/Doubtful. This replaces the enum column
-- introduced in 00184. Safe: the table has no rows yet.

ALTER TABLE public.v2_event_participants DROP COLUMN IF EXISTS status;

ALTER TABLE public.v2_event_participants
  ADD COLUMN IF NOT EXISTS likelihood SMALLINT,
  ADD COLUMN IF NOT EXISTS on_roster BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS likelihood_set_at TIMESTAMPTZ;

ALTER TABLE public.v2_event_participants
  DROP CONSTRAINT IF EXISTS v2_ep_likelihood_check;
ALTER TABLE public.v2_event_participants
  ADD CONSTRAINT v2_ep_likelihood_check CHECK (likelihood IN (25, 50, 75, 99));
