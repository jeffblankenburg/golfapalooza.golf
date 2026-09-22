## Summary
Parity sweep of the shipped v2 chat against v1's chat. The composer is now unified
(#185) and at parity; these **room-management and polish affordances** from v1 were not
carried over.

## Shipped
- **Room settings** — a group-chat settings sheet (gear in the room header, group rooms
  only): **rename** (any member, 1–50 chars), **add members** (any member; org members
  only), **remove members** (creator removes others, anyone removes self), and **leave
  group** (with a confirm). New endpoints: `PUT`/`DELETE /api/v2/chat/rooms/[roomId]` and
  `POST`/`DELETE /api/v2/chat/rooms/[roomId]/members`. GET now returns each member's role.
- **Mention → profile link.** Rendered `@mentions` in messages now deep-link to
  `/new/{slug}/loozers/{id}` (v1 parity), reusing the member detail from #187.

## Not a gap (verified against v1)
- **In-room search** — v1 has only global (cross-room) message search, which v2 already
  ships in the room list. No within-room search existed in v1, so nothing to port.

## Deferred (minor, still open)
- **Client-side image compression** before upload (shared with Photos #193 — do together).
- **Typing-indicator wording** polish to match v1 exactly.

Part of the Community epic (#172).
