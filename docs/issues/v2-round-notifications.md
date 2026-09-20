## Summary
Wire up the **roster-based** notifications for v2 rounds (currently the v2 round APIs fire none). These are the portable-now set — they don't need the follow-a-golfer system (see the separate issue for those).

## What v1 does (roster-based)
- **Round invite** (`round_invite`) — `POST /api/v2/rounds` + `POST /api/v2/rounds/[id]/players`: push every added player **except the actor**. "X added you to a round" / "Course — tee", deep-link to the scorer. (Legacy: `src/lib/rounds/notify.ts::notifyPlayersAddedToRound`.)
- **Round comment** (`round_comment`) — `POST /api/v2/rounds/[id]/comments`: push roster players **except the commenter**, body = preview, deep-link to the round.
- **NEW — comment @mention**: the v2 comment composer now supports mentions (`@[Name](id)`). Notify the mentioned user(s), like chat mentions.

## v2 infra available
- `sendV2Notifications(admin, userIds, {type, title, body, data, orgId})` — per-user prefs + push already handled.

## ✅ Resolved decisions (org scoping, mentions, deep-link)
`v2_notifications.org_id` is NOT NULL + prefs are org-scoped, but rounds have no org. Resolution:

- **Org = the group the round was logged under.** Add **`v2_rounds.org_id`** (nullable), stamped at creation from the `/new/{slug}` context the round was logged in. `POST /api/v2/rounds` must accept + store it (RoundForm already has `orgId`). Imported/historical rounds (00225) have `org_id = null` → they don't notify (fine). The round data itself **stays global** in every group's history — `org_id` is only for notification/social routing, not access control.
- **All round notifications use `round.org_id`**; deep-links resolve that org's slug.
- **Every recipient is in that org by construction** (roster is picked from org members; mention candidates are org members; guests have no account) → org-scoped prefs resolve with no cross-group edge cases.
- **Mention scope**: `@` autocompletes **any member of the round's group** (not just players); mentioning a non-player still notifies them.
- **Deep-links**:
  - `round_invite` → the scorer (`/new/{slug}/rounds/{id}/score`) — exists.
  - `round_comment` / `round_mention` → the **standalone round page `/new/{slug}/rounds/{id}` with comments auto-expanded** (see separate standalone-round-page issue). This replaces the earlier "open the drawer" idea, which only worked for players — a mentioned non-player has no round in their My Rounds. The standalone page is group-visible, so it works for everyone. **Depends on that page existing.**

## Scope
- Add a `src/lib/v2/rounds/notify.ts` (mirror legacy, v2 tables + `sendV2Notifications`).
- Fire `round_invite` from the create + add-players paths (skip actor + guests).
- Fire `round_comment` + mention (`round_mention`) notifications from the comments POST.
- Respect simulator suppression + per-type prefs.
- **Manageable in notification settings**: register the new types (`round_invite`, `round_comment`, `round_mention`) in `NOTIFICATION_SECTIONS` (`src/lib/v2/notification-prefs.ts`) — likely a new "My Rounds" section — so each is a per-type toggle in settings. Types NOT registered there have no toggle (always in-app + push-per-master), so this step is required for them to be user-manageable.

## Notes
Part of the My Rounds epic (#174). Related: #163 (per-type notification prefs).
