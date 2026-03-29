-- Migration: Event-specific chat rooms
-- 1. Add trip_id column to chat_rooms
-- 2. Rename "Loozers" room to "All Loozers"
-- 3. Create a chat room for the active trip
-- 4. Populate members from event_participants

-- Add nullable trip_id to chat_rooms (links a room to a specific event)
ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES public.trip_settings(id) ON DELETE CASCADE;

-- Rename the existing "Loozers" group chat to "All Loozers"
UPDATE public.chat_rooms
SET name = 'All Loozers'
WHERE type = 'group' AND name = 'Loozers';

-- Create event chat room for the active trip and populate members
DO $$
DECLARE
  v_trip_id uuid;
  v_trip_name text;
  v_room_id uuid;
BEGIN
  -- Find the active trip
  SELECT id, trip_name INTO v_trip_id, v_trip_name
  FROM public.trip_settings
  WHERE status = 'active'
  LIMIT 1;

  IF v_trip_id IS NOT NULL THEN
    -- Only create if an event room doesn't already exist for this trip
    SELECT id INTO v_room_id
    FROM public.chat_rooms
    WHERE trip_id = v_trip_id
    LIMIT 1;

    IF v_room_id IS NULL THEN
      INSERT INTO public.chat_rooms (type, name, trip_id)
      VALUES ('group', v_trip_name, v_trip_id)
      RETURNING id INTO v_room_id;

      -- Add all current event participants as members
      INSERT INTO public.chat_room_members (room_id, user_id)
      SELECT v_room_id, ep.user_id
      FROM public.event_participants ep
      WHERE ep.trip_id = v_trip_id
      ON CONFLICT (room_id, user_id) DO NOTHING;
    END IF;
  END IF;
END $$;
