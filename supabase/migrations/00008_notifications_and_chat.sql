-- Migration: Notifications and Chat system
-- Tables: notifications, push_subscriptions, chat_rooms, chat_room_members,
--         chat_messages, chat_reactions, chat_read_receipts

-- ============================================================================
-- 1. CREATE ALL TABLES FIRST
-- ============================================================================

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb DEFAULT '{}',
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
  ON public.notifications (user_id, read, created_at DESC);

-- Push Subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- Chat Rooms
CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('group', 'dm')),
  name text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Chat Room Members
CREATE TABLE IF NOT EXISTS public.chat_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_room_members_user
  ON public.chat_room_members (user_id);

CREATE INDEX IF NOT EXISTS idx_chat_room_members_room
  ON public.chat_room_members (room_id);

-- Chat Messages
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text,
  image_url text,
  reply_to_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT content_or_image CHECK (content IS NOT NULL OR image_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created
  ON public.chat_messages (room_id, created_at DESC);

-- Chat Reactions
CREATE TABLE IF NOT EXISTS public.chat_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message
  ON public.chat_reactions (message_id);

-- Chat Read Receipts
CREATE TABLE IF NOT EXISTS public.chat_read_receipts (
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  last_read_at timestamptz DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

-- ============================================================================
-- 2. ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_read_receipts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. HELPER FUNCTIONS (tables exist now)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_chat_room_member(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_room_members
    WHERE room_id = p_room_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_message_room_member(p_message_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_room_members crm
    JOIN public.chat_messages cm ON cm.room_id = crm.room_id
    WHERE cm.id = p_message_id AND crm.user_id = auth.uid()
  );
$$;

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================

-- Notifications
DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role inserts notifications" ON public.notifications;
CREATE POLICY "Service role inserts notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

-- Push Subscriptions
DROP POLICY IF EXISTS "Users manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users manage own push subscriptions" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- Chat Rooms
DROP POLICY IF EXISTS "Members can read chat rooms" ON public.chat_rooms;
CREATE POLICY "Members can read chat rooms" ON public.chat_rooms
  FOR SELECT USING (public.is_chat_room_member(id));

DROP POLICY IF EXISTS "Authenticated users can create chat rooms" ON public.chat_rooms;
CREATE POLICY "Authenticated users can create chat rooms" ON public.chat_rooms
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Chat Room Members
DROP POLICY IF EXISTS "Members can read room membership" ON public.chat_room_members;
CREATE POLICY "Members can read room membership" ON public.chat_room_members
  FOR SELECT USING (public.is_chat_room_member(room_id));

DROP POLICY IF EXISTS "Authenticated users can insert room members" ON public.chat_room_members;
CREATE POLICY "Authenticated users can insert room members" ON public.chat_room_members
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Chat Messages
DROP POLICY IF EXISTS "Members can read messages" ON public.chat_messages;
CREATE POLICY "Members can read messages" ON public.chat_messages
  FOR SELECT USING (public.is_chat_room_member(room_id));

DROP POLICY IF EXISTS "Members can send messages" ON public.chat_messages;
CREATE POLICY "Members can send messages" ON public.chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND public.is_chat_room_member(room_id)
  );

-- Chat Reactions
DROP POLICY IF EXISTS "Members can read reactions" ON public.chat_reactions;
CREATE POLICY "Members can read reactions" ON public.chat_reactions
  FOR SELECT USING (public.is_message_room_member(message_id));

DROP POLICY IF EXISTS "Members can add reactions" ON public.chat_reactions;
CREATE POLICY "Members can add reactions" ON public.chat_reactions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.is_message_room_member(message_id)
  );

DROP POLICY IF EXISTS "Users can remove own reactions" ON public.chat_reactions;
CREATE POLICY "Users can remove own reactions" ON public.chat_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- Chat Read Receipts
DROP POLICY IF EXISTS "Members can read receipts" ON public.chat_read_receipts;
CREATE POLICY "Members can read receipts" ON public.chat_read_receipts
  FOR SELECT USING (public.is_chat_room_member(room_id));

DROP POLICY IF EXISTS "Users can insert own read receipts" ON public.chat_read_receipts;
CREATE POLICY "Users can insert own read receipts" ON public.chat_read_receipts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own read receipts" ON public.chat_read_receipts;
CREATE POLICY "Users can update own read receipts" ON public.chat_read_receipts
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- 5. ENABLE REALTIME
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_read_receipts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_read_receipts;
  END IF;
END $$;

-- ============================================================================
-- 6. AUTO-CREATE "LOOZERS" GROUP CHAT WITH ALL EXISTING USERS
-- ============================================================================

DO $$
DECLARE
  v_room_id uuid;
BEGIN
  -- Only create if it doesn't already exist
  SELECT id INTO v_room_id FROM public.chat_rooms
  WHERE type = 'group' AND name = 'Loozers'
  LIMIT 1;

  IF v_room_id IS NULL THEN
    INSERT INTO public.chat_rooms (type, name)
    VALUES ('group', 'Loozers')
    RETURNING id INTO v_room_id;

    INSERT INTO public.chat_room_members (room_id, user_id)
    SELECT v_room_id, id FROM public.users
    WHERE is_active = true;
  END IF;
END $$;
