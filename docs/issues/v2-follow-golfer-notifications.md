## Summary
Build a v2 **follow-a-golfer** ("favorite Loozers") system and the spectator notifications that ride on it: round started, hole scored, round completed. v2 has **no follow system today** (only music favorites), so these three v1 notifications currently have no foundation.

## What v1 does (favorites-based)
All fan out to users who **favorited** the player, gated by per-favorite toggles (`src/lib/favorites/fanout.ts`, table `user_favorites`):
- **`notify_round_started`** — on round create, to each player's followers (minus those playing).
- **`notify_hole_completed`** — on the FIRST score of a (player, hole); never on edits; skipped for scrambles/completed; carries a "3 over thru 7" standing.
- **`notify_round_completed`** — on completion.

## ✅ Resolved decisions
- **Terminology — per-org configurable member label**: each group can name its members (like the per-org system-entity name). Add `v2_organizations.member_noun` (singular) + `member_noun_plural`, admin-editable in settings, **default "Member"/"Members"** (or "Participant"/"Participants"). Golfapalooza sets "Loozer"/"Loozers". Used for the directory title + anywhere members are collectively named. Never hardcode "Golfers." (Reusable app-wide, not just here.)
- **Members directory (new surface, visible to ALL)**: a browsable list of every group member with a Follow / Following control on each row. This is the "participants visible to all users" discovery surface. Names honor the org's default naming (pickName). **Does not exist today — new build.**
- **Member profile view (new)**: tapping a member opens their profile/detail (read-only) with a Follow control + the per-follow notification toggles. v2 today has ONLY the signed-in user's `ProfileDrawer` — no other-member view exists, so this is new.
- **Follow entry points**: both the directory row Follow button AND the member profile.
- **Notification control**: **per-follow toggles** (`notify_round_started` / `notify_hole_completed` / `notify_round_completed`, chosen per followed member) PLUS a **global per-type mute** registered in `NOTIFICATION_SECTIONS` (a follower must have the follow toggle ON *and* not have muted the type globally).
- **Deep-link (resolved)**: the standalone round page `/new/[slug]/rounds/[id]` (shipped in #189) — no separate spectator view needed.

## Scope
- **Follow model**: a `v2_user_favorites` table (`follower_id` → `favorite_user_id`, + the three per-type booleans). Grants + RLS per the v2 pattern. Follows are global (you follow a person, not a person-in-a-group).
- **Follow API**: follow/unfollow, update per-type toggles, and "am I following X" / follower lists.
- **Members directory + member profile** surfaces (see above).
- **Fan-out**: v2 port of `fanout.ts` using `sendV2Notifications`; wire into `POST /api/v2/rounds` (started), `POST /api/v2/rounds/[id]/scores` (hole), `POST /api/v2/rounds/[id]/complete` (completed).
- Suppress a follower who is themselves on the round (they're right there).
- **Manageable in notification settings**: register `notify_round_started`, `notify_hole_completed`, `notify_round_completed` in `NOTIFICATION_SECTIONS` (`src/lib/v2/notification-prefs.ts`) so followers can toggle each. (These may double as the per-follow toggles, or the per-follow toggles gate WHO and the settings toggle gates the master per-type — decide during build.)

## ✅ Org scoping (resolved)
Uses the same rule as #186: notifications belong to **`v2_rounds.org_id`** (the group the round was logged under). Follows themselves may still be global (you follow a golfer, not a golfer-in-a-group) — but each spectator notification is created under the round's org, so a follower only gets it if they're a member of that group AND haven't toggled the type off there. (Decide during build whether a follow with no shared group simply never fires.)

## Notes
Part of the My Rounds epic (#174). Larger than the roster-based notifications; do that one first.
