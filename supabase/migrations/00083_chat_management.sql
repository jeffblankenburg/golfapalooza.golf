-- Migration: Chat management features
-- Adds: role, is_pinned, hidden_at to chat_room_members
-- Creates: chat_hidden_messages table for iMessage-style per-user message deletion
-- Backfills creator roles from chat_rooms.created_by

-- ============================================================================
-- 1. ADD COLUMNS TO chat_room_members
-- ============================================================================

ALTER TABLE public.chat_room_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('creator', 'member'));

ALTER TABLE public.chat_room_members
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

ALTER TABLE public.chat_room_members
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

-- ============================================================================
-- 2. BACKFILL: set role = 'creator' for room creators
-- ============================================================================

UPDATE public.chat_room_members crm
SET role = 'creator'
FROM public.chat_rooms cr
WHERE crm.room_id = cr.id
  AND crm.user_id = cr.created_by;

-- ============================================================================
-- 3. CREATE chat_hidden_messages TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_hidden_messages (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_hidden_messages_user
  ON public.chat_hidden_messages (user_id);

-- ============================================================================
-- 4. ENABLE RLS ON NEW TABLE
-- ============================================================================

ALTER TABLE public.chat_hidden_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own hidden messages" ON public.chat_hidden_messages;
CREATE POLICY "Users manage own hidden messages" ON public.chat_hidden_messages
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 5. NEW RLS POLICIES FOR EXISTING TABLES
-- ============================================================================

-- Members can update chat room name (for rename)
DROP POLICY IF EXISTS "Members can update chat rooms" ON public.chat_rooms;
CREATE POLICY "Members can update chat rooms" ON public.chat_rooms
  FOR UPDATE USING (public.is_chat_room_member(id));

-- Members can update their own membership row (pin, hidden_at)
DROP POLICY IF EXISTS "Members can update own membership" ON public.chat_room_members;
CREATE POLICY "Members can update own membership" ON public.chat_room_members
  FOR UPDATE USING (auth.uid() = user_id);

-- Members can delete their own membership (leave)
DROP POLICY IF EXISTS "Members can delete own membership" ON public.chat_room_members;
CREATE POLICY "Members can delete own membership" ON public.chat_room_members
  FOR DELETE USING (auth.uid() = user_id);
