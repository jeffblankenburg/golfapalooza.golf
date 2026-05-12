-- Storage bucket for chat-message image uploads. The `MessageInput`
-- component uploads under the path `${room_id}/${timestamp}-${filename}`
-- and writes the resulting public URL into the chat message row.
--
-- Public read: chat images render with plain <img src> tags from the
-- public URL, no signing needed.
-- Authenticated insert: any signed-in Loozer can upload (chat is for
-- Loozers; the path's room_id segment + the chat_messages RLS policies
-- gate who can actually post to a given room).
-- Owner update/delete: only the uploader can replace or remove their
-- own file. Storage's built-in `owner` column tracks this.

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view chat images" ON storage.objects;
CREATE POLICY "Anyone can view chat images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-images');

DROP POLICY IF EXISTS "Authenticated users can upload chat images" ON storage.objects;
CREATE POLICY "Authenticated users can upload chat images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-images');

DROP POLICY IF EXISTS "Owners can update their chat images" ON storage.objects;
CREATE POLICY "Owners can update their chat images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'chat-images' AND owner = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owners can delete their chat images" ON storage.objects;
CREATE POLICY "Owners can delete their chat images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'chat-images' AND owner = (SELECT auth.uid()));
