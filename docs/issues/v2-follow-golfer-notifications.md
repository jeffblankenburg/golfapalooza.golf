## Summary
Build a v2 **follow-a-golfer** ("favorite Loozers") system and the spectator notifications that ride on it: round started, hole scored, round completed. v2 has **no follow system today** (only music favorites), so these three v1 notifications currently have no foundation.

## What v1 does (favorites-based)
All fan out to users who **favorited** the player, gated by per-favorite toggles (`src/lib/favorites/fanout.ts`, table `user_favorites`):
- **`notify_round_started`** — on round create, to each player's followers (minus those playing).
- **`notify_hole_completed`** — on the FIRST score of a (player, hole); never on edits; skipped for scrambles/completed; carries a "3 over thru 7" standing.
- **`notify_round_completed`** — on completion.

## Scope
- **Follow model**: a `v2_user_favorites` table (follower → favorite golfer) with per-type toggles (`notify_round_started`, `notify_hole_completed`, `notify_round_completed`). Grants + RLS per the v2 pattern.
- **UI**: follow/unfollow a golfer + manage toggles (where? profile, or a golfer detail view — TBD).
- **Fan-out**: v2 port of `fanout.ts` using `sendV2Notifications`; wire into `POST /api/v2/rounds` (started), `POST /api/v2/rounds/[id]/scores` (hole), `POST /api/v2/rounds/[id]/complete` (completed).
- Suppress a follower who is themselves on the round (they're right there).
- Deep-link to a spectator/read-only scorecard (does v2 have one? may need `/new/[slug]/rounds/[id]` read-only view).
- **Manageable in notification settings**: register `notify_round_started`, `notify_hole_completed`, `notify_round_completed` in `NOTIFICATION_SECTIONS` (`src/lib/v2/notification-prefs.ts`) so followers can toggle each. (These may double as the per-follow toggles, or the per-follow toggles gate WHO and the settings toggle gates the master per-type — decide during build.)

## ✅ Org scoping (resolved)
Uses the same rule as #186: notifications belong to **`v2_rounds.org_id`** (the group the round was logged under). Follows themselves may still be global (you follow a golfer, not a golfer-in-a-group) — but each spectator notification is created under the round's org, so a follower only gets it if they're a member of that group AND haven't toggled the type off there. (Decide during build whether a follow with no shared group simply never fires.)

## Notes
Part of the My Rounds epic (#174). Larger than the roster-based notifications; do that one first.
