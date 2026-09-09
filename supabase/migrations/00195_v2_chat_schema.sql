-- v2 chat schema. Mirrors the legacy chat model (rooms/members/messages/
-- reactions/read_receipts/hidden_messages) but org-scoped and v2-owned. History
-- is imported separately (00196) preserving original UUIDs, so IDs here are plain
-- uuid PKs (default gen_random_uuid for NEW rows). All user refs point at
-- v2_profiles (same id space as legacy users; all migrated).

DROP TABLE IF EXISTS public.v2_chat_hidden_messages;
DROP TABLE IF EXISTS public.v2_chat_read_receipts;
DROP TABLE IF EXISTS public.v2_chat_reactions;
DROP TABLE IF EXISTS public.v2_chat_messages;
DROP TABLE IF EXISTS public.v2_chat_room_members;
DROP TABLE IF EXISTS public.v2_chat_rooms;
DROP FUNCTION IF EXISTS public.v2_is_chat_member(UUID);
DROP FUNCTION IF EXISTS public.v2_is_message_room_member(UUID);

CREATE TABLE public.v2_chat_rooms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  event_id   UUID REFERENCES public.v2_events(id) ON DELETE SET NULL,
  type       TEXT NOT NULL CHECK (type IN ('group', 'dm')),
  name       TEXT,
  created_by UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_v2_chat_rooms_org ON public.v2_chat_rooms(org_id);

CREATE TABLE public.v2_chat_room_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id   UUID NOT NULL REFERENCES public.v2_chat_rooms(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('creator', 'member')),
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  hidden_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);
CREATE INDEX idx_v2_chat_members_user ON public.v2_chat_room_members(user_id);
CREATE INDEX idx_v2_chat_members_room ON public.v2_chat_room_members(room_id);

CREATE TABLE public.v2_chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES public.v2_chat_rooms(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  content     TEXT,
  image_url   TEXT,
  reply_to_id UUID REFERENCES public.v2_chat_messages(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_chat_content_or_image CHECK (content IS NOT NULL OR image_url IS NOT NULL)
);
-- Supports realtime + cursor-based reverse pagination (load older on scroll-up).
CREATE INDEX idx_v2_chat_messages_room_created
  ON public.v2_chat_messages(room_id, created_at DESC);

CREATE TABLE public.v2_chat_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.v2_chat_messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX idx_v2_chat_reactions_message ON public.v2_chat_reactions(message_id);

CREATE TABLE public.v2_chat_read_receipts (
  room_id              UUID NOT NULL REFERENCES public.v2_chat_rooms(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  last_read_message_id UUID REFERENCES public.v2_chat_messages(id) ON DELETE SET NULL,
  last_read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE public.v2_chat_hidden_messages (
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.v2_chat_messages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

-- ── Membership helpers (SECURITY DEFINER — avoid RLS recursion) ───────────────
CREATE FUNCTION public.v2_is_chat_member(p_room UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.v2_chat_room_members m
    WHERE m.room_id = p_room AND m.user_id = auth.uid()
  );
$$;

CREATE FUNCTION public.v2_is_message_room_member(p_message UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.v2_chat_messages msg
    JOIN public.v2_chat_room_members m ON m.room_id = msg.room_id
    WHERE msg.id = p_message AND m.user_id = auth.uid()
  );
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.v2_chat_rooms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_chat_room_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_chat_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_chat_reactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_chat_read_receipts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_chat_hidden_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_room_select" ON public.v2_chat_rooms FOR SELECT
  TO authenticated USING (public.v2_is_chat_member(id));
CREATE POLICY "v2_room_insert" ON public.v2_chat_rooms FOR INSERT
  TO authenticated WITH CHECK (created_by = auth.uid() AND public.v2_is_org_member(org_id));

CREATE POLICY "v2_member_select" ON public.v2_chat_room_members FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR public.v2_is_chat_member(room_id));
CREATE POLICY "v2_member_update_own" ON public.v2_chat_room_members FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "v2_msg_select" ON public.v2_chat_messages FOR SELECT
  TO authenticated USING (public.v2_is_chat_member(room_id));
CREATE POLICY "v2_msg_insert" ON public.v2_chat_messages FOR INSERT
  TO authenticated WITH CHECK (sender_id = auth.uid() AND public.v2_is_chat_member(room_id));

CREATE POLICY "v2_reaction_select" ON public.v2_chat_reactions FOR SELECT
  TO authenticated USING (public.v2_is_message_room_member(message_id));
CREATE POLICY "v2_reaction_write" ON public.v2_chat_reactions FOR ALL
  TO authenticated
  USING (user_id = auth.uid() AND public.v2_is_message_room_member(message_id))
  WITH CHECK (user_id = auth.uid() AND public.v2_is_message_room_member(message_id));

CREATE POLICY "v2_receipt_manage_own" ON public.v2_chat_read_receipts FOR ALL
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "v2_hidden_manage_own" ON public.v2_chat_hidden_messages FOR ALL
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Grants ────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_chat_rooms          TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_chat_room_members   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_chat_messages       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_chat_reactions      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_chat_read_receipts  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_chat_hidden_messages TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.v2_is_chat_member(UUID)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.v2_is_message_room_member(UUID) TO authenticated, service_role;

-- ── Realtime ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_chat_reactions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_chat_read_receipts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
