-- 00237_v2_chat_managed_channels.sql
-- Managed auto-membership chat channels (v1 parity, lost in the v2 import).
--   • all_members — one per org; ALWAYS holds every active, non-archived member.
--                   Nobody can leave/rename/manage it (it's automatic).
--   • event       — one per event; holds everyone opted into the event
--                   (v2_event_participants.on_roster). Opting out removes the
--                   membership (the room vanishes from their list) but their past
--                   messages persist (messages key off sender_id, not membership).
-- Regular user-created group/DM rooms are room_kind='regular' (the default).
--
-- v1 marked these via `created_by IS NULL`; v2 uses an explicit room_kind so the
-- app can special-case them cleanly. Ongoing sync lives in app code
-- (src/lib/v2/chat/channels.ts) wired into org-join, archive, RSVP, and event create.

ALTER TABLE public.v2_chat_rooms
  ADD COLUMN IF NOT EXISTS room_kind TEXT NOT NULL DEFAULT 'regular';

ALTER TABLE public.v2_chat_rooms DROP CONSTRAINT IF EXISTS v2_chat_rooms_kind_chk;
ALTER TABLE public.v2_chat_rooms
  ADD CONSTRAINT v2_chat_rooms_kind_chk CHECK (room_kind IN ('regular', 'all_members', 'event'));

-- Mark the imported "All Loozers" / "Loozers" system room (v1 system rooms have no creator).
UPDATE public.v2_chat_rooms
   SET room_kind = 'all_members'
 WHERE room_kind = 'regular'
   AND type = 'group'
   AND created_by IS NULL
   AND (name ILIKE 'all loozers' OR name ILIKE 'loozers');

-- At most one managed channel of each kind per scope.
CREATE UNIQUE INDEX IF NOT EXISTS idx_v2_chat_one_all_members
  ON public.v2_chat_rooms (org_id) WHERE room_kind = 'all_members';
CREATE UNIQUE INDEX IF NOT EXISTS idx_v2_chat_one_event_room
  ON public.v2_chat_rooms (event_id) WHERE room_kind = 'event' AND event_id IS NOT NULL;

-- Ensure every org with active members has an all_members channel, then sync its
-- roster to all active, non-archived members.
DO $$
DECLARE o RECORD; v_room UUID;
BEGIN
  FOR o IN SELECT id, member_noun_plural FROM public.v2_organizations LOOP
    SELECT id INTO v_room FROM public.v2_chat_rooms
      WHERE org_id = o.id AND room_kind = 'all_members' LIMIT 1;

    IF v_room IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.v2_memberships WHERE org_id = o.id AND status = 'active') THEN
        INSERT INTO public.v2_chat_rooms (org_id, type, name, room_kind)
        VALUES (o.id, 'group', 'All ' || COALESCE(NULLIF(TRIM(o.member_noun_plural), ''), 'Members'), 'all_members')
        RETURNING id INTO v_room;
      END IF;
    END IF;

    IF v_room IS NOT NULL THEN
      INSERT INTO public.v2_chat_room_members (room_id, user_id, role)
      SELECT v_room, m.user_id, 'member'
        FROM public.v2_memberships m
       WHERE m.org_id = o.id AND m.status = 'active' AND m.archived_at IS NULL
      ON CONFLICT (room_id, user_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Create an event channel for each active event, seeded with its current roster.
DO $$
DECLARE e RECORD; v_room UUID;
BEGIN
  FOR e IN SELECT id, org_id, name FROM public.v2_events WHERE status = 'active' LOOP
    SELECT id INTO v_room FROM public.v2_chat_rooms
      WHERE event_id = e.id AND room_kind = 'event' LIMIT 1;

    IF v_room IS NULL THEN
      INSERT INTO public.v2_chat_rooms (org_id, event_id, type, name, room_kind)
      VALUES (e.org_id, e.id, 'group', e.name, 'event')
      RETURNING id INTO v_room;
    END IF;

    INSERT INTO public.v2_chat_room_members (room_id, user_id, role)
    SELECT v_room, ep.user_id, 'member'
      FROM public.v2_event_participants ep
     WHERE ep.event_id = e.id AND ep.on_roster = true
    ON CONFLICT (room_id, user_id) DO NOTHING;
  END LOOP;
END $$;

-- Existing table (grants from 00195); no new grant required.
