-- Reactions need full delete payloads over realtime: by default a DELETE only
-- broadcasts the primary key (id), so a client can't tell which message/emoji was
-- removed to un-render the badge. REPLICA IDENTITY FULL includes every column in
-- the delete payload (message_id, user_id, emoji). Additive; safe to re-run.

ALTER TABLE public.v2_chat_reactions REPLICA IDENTITY FULL;
