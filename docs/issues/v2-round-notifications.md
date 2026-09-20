## Summary
Wire up the **roster-based** notifications for v2 rounds (currently the v2 round APIs fire none). These are the portable-now set — they don't need the follow-a-golfer system (see the separate issue for those).

## What v1 does (roster-based)
- **Round invite** (`round_invite`) — `POST /api/v2/rounds` + `POST /api/v2/rounds/[id]/players`: push every added player **except the actor**. "X added you to a round" / "Course — tee", deep-link to the scorer. (Legacy: `src/lib/rounds/notify.ts::notifyPlayersAddedToRound`.)
- **Round comment** (`round_comment`) — `POST /api/v2/rounds/[id]/comments`: push roster players **except the commenter**, body = preview, deep-link to the round.
- **NEW — comment @mention**: the v2 comment composer now supports mentions (`@[Name](id)`). Notify the mentioned user(s), like chat mentions.

## v2 infra available
- `sendV2Notifications(admin, userIds, {type, title, body, data, orgId})` — per-user prefs + push already handled.

## ⚠️ Design decision: org scoping
`v2_notifications` rows carry an **`org_id`** and prefs are **org-scoped**, but rounds are **personal & global** (not tied to an org). A round can involve players from different groups, and the v2 scorer URL is org-scoped (`/new/[slug]/rounds/[id]/score`). Need a rule before building:
- Which `org_id` do round notifications use? (Acting user's current org? Each recipient's own org? Null/global?)
- What slug does the deep-link use for a global round — the recipient's org context?
Resolve this first; it shapes the payload + link.

## Scope
- Add a `src/lib/v2/rounds/notify.ts` (mirror legacy, v2 tables + `sendV2Notifications`).
- Fire `round_invite` from the create + add-players paths (skip actor + guests).
- Fire `round_comment` + mention (`round_mention`) notifications from the comments POST.
- Respect simulator suppression + per-type prefs.
- **Manageable in notification settings**: register the new types (`round_invite`, `round_comment`, `round_mention`) in `NOTIFICATION_SECTIONS` (`src/lib/v2/notification-prefs.ts`) — likely a new "My Rounds" section — so each is a per-type toggle in settings. Types NOT registered there have no toggle (always in-app + push-per-master), so this step is required for them to be user-manageable.

## Notes
Part of the My Rounds epic (#174). Related: #163 (per-type notification prefs).
