-- Add foreign keys from chat tables to public.users so PostgREST can resolve joins
-- The existing FKs point to auth.users, but Supabase PostgREST needs FKs to public.users
-- for join syntax like user:users(id, display_name)

-- chat_room_members.user_id → public.users
ALTER TABLE public.chat_room_members
  ADD CONSTRAINT chat_room_members_public_user_fk
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- chat_messages.sender_id → public.users
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_sender_public_user_fk
  FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- chat_reactions.user_id → public.users
ALTER TABLE public.chat_reactions
  ADD CONSTRAINT chat_reactions_public_user_fk
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- chat_read_receipts.user_id → public.users
ALTER TABLE public.chat_read_receipts
  ADD CONSTRAINT chat_read_receipts_public_user_fk
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- notifications.user_id → public.users
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_public_user_fk
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
