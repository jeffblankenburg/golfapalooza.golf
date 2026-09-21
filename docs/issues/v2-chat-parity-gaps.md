## Summary
Parity sweep of the shipped v2 chat against v1's chat. The composer is now unified
(#185) and at parity; these **room-management and polish affordances** from v1 were not
carried over.

## Gaps
- **Room settings.** v1 lets a room's members rename the room, add/remove members, and
  leave. v2 has no room-settings surface at all — rooms are effectively fixed once
  created.
- **In-room message search.** v1 can search within a conversation; v2 has no search.
- **Mention → profile link.** In v1 a rendered `@mention` is tappable and opens that
  member's profile. v2 renders the name as plain styled text (now that the members
  directory + member detail exist in #187, the mention can deep-link to
  `/new/{slug}/loozers/{id}`).
- **Client-side image compression** before upload. v1 downsizes/compresses; v2 uploads
  the raw file, which is slower and heavier on mobile data.
- **Typing-indicator wording.** Minor: v1 shows named typing ("Jeff is typing…"); v2's
  wording/spacing differs. Align to v1.

Part of the Community epic (#172).
