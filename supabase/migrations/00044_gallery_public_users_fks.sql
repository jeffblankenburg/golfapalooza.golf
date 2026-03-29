-- Add foreign keys from gallery tables to public.users so PostgREST can resolve joins
-- Same pattern as 00010_add_chat_public_users_fks.sql
-- The existing FKs point to auth.users, but Supabase PostgREST needs FKs to public.users
-- for join syntax like uploader:users(id, display_name, avatar_url)

-- gallery_items.uploader_id → public.users
ALTER TABLE public.gallery_items
  ADD CONSTRAINT gallery_items_uploader_public_user_fk
  FOREIGN KEY (uploader_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- gallery_reactions.user_id → public.users
ALTER TABLE public.gallery_reactions
  ADD CONSTRAINT gallery_reactions_public_user_fk
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- gallery_comments.sender_id → public.users
ALTER TABLE public.gallery_comments
  ADD CONSTRAINT gallery_comments_sender_public_user_fk
  FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- gallery_tags.tagged_user_id → public.users
ALTER TABLE public.gallery_tags
  ADD CONSTRAINT gallery_tags_tagged_public_user_fk
  FOREIGN KEY (tagged_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- gallery_tags.tagger_id → public.users
ALTER TABLE public.gallery_tags
  ADD CONSTRAINT gallery_tags_tagger_public_user_fk
  FOREIGN KEY (tagger_id) REFERENCES public.users(id) ON DELETE CASCADE;
