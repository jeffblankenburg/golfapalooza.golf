-- Import legacy chat into v2, preserving ORIGINAL UUIDs so room/message/reply
-- FKs map directly. IDEMPOTENT + RE-RUNNABLE: run now, and again at cutover to
-- pull in everything new (ON CONFLICT DO NOTHING for immutable rows; receipts
-- upsert so read state stays fresh). All chat maps to the Golfapalooza org;
-- event_id left NULL (legacy rooms are trip-scoped, not aligned to v2 events).
-- Rows referencing a user not present in v2_profiles are skipped for integrity.

-- 1) Rooms (created_by kept only when the creator has a v2 profile).
INSERT INTO public.v2_chat_rooms (id, org_id, type, name, created_by, created_at)
SELECT
  r.id,
  o.id,
  r.type,
  r.name,
  (SELECT p.id FROM public.v2_profiles p WHERE p.id = r.created_by),
  COALESCE(r.created_at, now())
FROM public.chat_rooms r
CROSS JOIN (SELECT id FROM public.v2_organizations WHERE slug = 'golfapalooza' LIMIT 1) o
ON CONFLICT (id) DO NOTHING;

-- 2) Members (must have a v2 profile + an imported room).
INSERT INTO public.v2_chat_room_members (id, room_id, user_id, role, is_pinned, hidden_at, joined_at)
SELECT
  m.id, m.room_id, m.user_id,
  COALESCE(m.role, 'member'),
  COALESCE(m.is_pinned, false),
  m.hidden_at,
  COALESCE(m.joined_at, now())
FROM public.chat_room_members m
WHERE EXISTS (SELECT 1 FROM public.v2_profiles p WHERE p.id = m.user_id)
  AND EXISTS (SELECT 1 FROM public.v2_chat_rooms r WHERE r.id = m.room_id)
ON CONFLICT (id) DO NOTHING;

-- 3) Messages — reply_to_id set in a second pass (avoids FK ordering issues and
--    dangling references to skipped messages).
INSERT INTO public.v2_chat_messages (id, room_id, sender_id, content, image_url, reply_to_id, created_at, updated_at)
SELECT
  msg.id, msg.room_id, msg.sender_id, msg.content, msg.image_url, NULL,
  COALESCE(msg.created_at, now()),
  COALESCE(msg.updated_at, now())
FROM public.chat_messages msg
WHERE EXISTS (SELECT 1 FROM public.v2_profiles p WHERE p.id = msg.sender_id)
  AND EXISTS (SELECT 1 FROM public.v2_chat_rooms r WHERE r.id = msg.room_id)
ON CONFLICT (id) DO NOTHING;

UPDATE public.v2_chat_messages v
SET reply_to_id = msg.reply_to_id
FROM public.chat_messages msg
WHERE v.id = msg.id
  AND v.reply_to_id IS NULL
  AND msg.reply_to_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.v2_chat_messages t WHERE t.id = msg.reply_to_id);

-- 4) Reactions (message imported + reactor has a v2 profile).
INSERT INTO public.v2_chat_reactions (id, message_id, user_id, emoji, created_at)
SELECT rx.id, rx.message_id, rx.user_id, rx.emoji, COALESCE(rx.created_at, now())
FROM public.chat_reactions rx
WHERE EXISTS (SELECT 1 FROM public.v2_chat_messages m WHERE m.id = rx.message_id)
  AND EXISTS (SELECT 1 FROM public.v2_profiles p WHERE p.id = rx.user_id)
ON CONFLICT (id) DO NOTHING;

-- 5) Read receipts — UPSERT so a cutover re-run refreshes read state.
INSERT INTO public.v2_chat_read_receipts (room_id, user_id, last_read_message_id, last_read_at)
SELECT
  rr.room_id, rr.user_id,
  (SELECT m.id FROM public.v2_chat_messages m WHERE m.id = rr.last_read_message_id),
  COALESCE(rr.last_read_at, now())
FROM public.chat_read_receipts rr
WHERE EXISTS (SELECT 1 FROM public.v2_chat_rooms r WHERE r.id = rr.room_id)
  AND EXISTS (SELECT 1 FROM public.v2_profiles p WHERE p.id = rr.user_id)
ON CONFLICT (room_id, user_id)
DO UPDATE SET last_read_message_id = EXCLUDED.last_read_message_id,
              last_read_at = EXCLUDED.last_read_at;

-- 6) Hidden messages (per-user deletes).
INSERT INTO public.v2_chat_hidden_messages (user_id, message_id, created_at)
SELECT hm.user_id, hm.message_id, COALESCE(hm.created_at, now())
FROM public.chat_hidden_messages hm
WHERE EXISTS (SELECT 1 FROM public.v2_chat_messages m WHERE m.id = hm.message_id)
  AND EXISTS (SELECT 1 FROM public.v2_profiles p WHERE p.id = hm.user_id)
ON CONFLICT (user_id, message_id) DO NOTHING;
