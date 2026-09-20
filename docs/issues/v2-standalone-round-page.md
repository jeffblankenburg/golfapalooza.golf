## Summary
Build a **standalone round page** at `/new/{slug}/rounds/{id}` — a read-only scorecard + comments, viewable by **any member of the round's group** (not just players). This is how non-players (mentioned spectators, followers) see a round and its comments, and it becomes the canonical deep-link target for round notifications.

## Why
- The My Rounds drawer (`GET /api/v2/rounds`) lists only rounds **you played in** (`.eq(players.user_id, you)`). A non-player has no entry point today.
- The detail API (`GET /api/v2/rounds/[id]`) is **already open to any authed user** — this is purely a missing UI surface.
- We chose (with the user) that comment/mention notifications should be viewable by any group member, and that mentions can tag any group member → they need somewhere to land.

## Scope
- New route `/new/{slug}/rounds/{id}` (org-gated to members of the round's group — see org-scoping in #186). Read-only scorecard (reuse `RoundDetail`'s rendering / factor a shared scorecard component) + comments.
- **Comments collapsed by default**, shown as a "Comments (N)" toggle (detail API now returns `comment_count`). **Auto-expanded when arrived via a comment/mention notification** (e.g. a `?c=1` / `#comments` param the deep-link sets).
- Mount the same collapsed comments in the **drawer's `RoundDetail` accordion** for players (so players see comments in My Rounds too; both surfaces share the realtime `RoundComments`).
- `RoundComments` needs `orgId` + `viewerId` — thread through `EventShell → RoundsDrawer → RoundDetail` for the drawer, and from the page loader for the standalone view.

## Deep-link / notifications
- `round_comment` + `round_mention` (#186) and spectator/follow notifications (#187) deep-link to **this page** (with comments auto-expanded), replacing the earlier "open the drawer" idea (which only worked for players).

## Not in scope
- A browsable group rounds **feed** (the other option considered) — non-players reach rounds via notifications/links only for now.

## Done already
- `GET /api/v2/rounds/[id]` returns `comment_count`.
