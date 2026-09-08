-- Phone-bound, single-use invites for the v2 members flow. Additive only.
-- An invite now targets a specific phone (E.164); only a user who verifies THAT
-- number can redeem it (prevents link forwarding). redeemed_by/redeemed_at record
-- consumption. Invite reads/writes happen server-side via the service role
-- (the invitee isn't a member yet, so RLS can't grant them access) — no policy
-- change needed.

ALTER TABLE public.v2_invites
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS redeemed_by UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_v2_invites_phone ON public.v2_invites(phone);
