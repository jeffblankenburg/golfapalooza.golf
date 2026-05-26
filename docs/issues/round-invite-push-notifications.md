# Feature: Push Notifications When Added to a Round

## Overview

Today, when Randy starts a round and adds Jeff to it, Jeff has no idea the round exists until he happens to open the app. Group rounds work best when everyone joins the live scoring session at the same time — currently there's no out-of-band signal.

This issue adds a push notification to every player added to a round (except the actor who added them), with a deep link straight into the live scorer.

Depends on issue #3 (co-equal ownership) for the new `POST /api/rounds/{id}/players` endpoint — the same notification fires from both POST `/api/rounds` (initial roster) and the new add-player endpoint.

## User Experience

### Trigger

- **At round creation** (`POST /api/rounds`): for every player on the initial roster *except* the actor (the user calling the endpoint), enqueue a push.
- **At mid-round add** (`POST /api/rounds/{id}/players`): for the single player being added, enqueue a push. (The actor never gets a notification — they just took the action.)

### Notification copy

- **Title**: "{Actor Name} added you to a round"
- **Body**: "{Course Name} — {Tee Color} tees" (omit the dash + tee line if no tee color)
- **Deep link**: `/my-rounds/rounds/{round_id}/live`
- **Type**: `round_invite`

### Iconography

Use the existing rounds/golf icon already in the notification UI. No new asset needed.

### Tap behavior

Tap takes the user to the live scorer directly. If the round is already `completed` by the time they tap, the live page already redirects to `/my-rounds` (existing behavior preserved).

## Data Model

No schema changes. Uses the existing `sendBulkNotifications` infrastructure and notification preferences plumbing.

## Surface Area

### Files

- `src/lib/rounds/notify.ts` — new helper `notifyPlayersAddedToRound({ roundId, playerUserIds, actorUserId })`. Loads round metadata (course name, tee color), builds the payload, calls `sendBulkNotifications` for every `playerUserIds` except `actorUserId`.
- `src/app/api/rounds/route.ts` (POST) — after the round + `round_players` insert succeed, call `notifyPlayersAddedToRound(...)` with the full roster.
- `src/app/api/rounds/[id]/players/route.ts` (POST, from issue #3) — call the same helper with the single added player.
- `CLAUDE.md` — note the new notification type and helper.
- `README.md` — mention "Players are pinged when added to a round."

### Notification preferences

Add `round_invite` to the notification preferences UI (wherever event/poll/announcement toggles live). Default **on**. Users can mute it but the default behavior is on — getting pulled into a round is high-signal.

## Edge Cases

- **Quick Entry roster**: when a user logs a round via Quick Entry that already happened, the other players still get a "you were added to a round" push. Copy is the same — they can open the scorecard and verify. (Worth considering: a different title like "{Actor} logged a round you played in" for completed rounds. Keep v1 simple and revisit if it's confusing.)
- **Actor is one of the players** (typical): never notify yourself.
- **Player has no push subscription**: `sendBulkNotifications` already skips silently.
- **Sim mode**: a simulating admin should NOT send a real push to the simulated user. The notify helper checks `isSimulating()` and short-circuits.
- **Notification preferences off**: respect `round_invite` preference.
- **Round creation failure**: only fire after both `rounds` insert AND `round_players` insert succeed.
- **Delivery best-effort**: notification failures must not fail the round creation. `notifyPlayersAddedToRound` swallows errors and logs them.

## Out of Scope

- Notifying when a player is **removed** from a round.
- Notifying when scores are entered on your behalf (issue #1 partially covers visibility via realtime; per-hole pings are covered by the favorites feature).
- In-app inbox / notification feed surface — covered by existing notifications surface.

## Acceptance Criteria

- [ ] Creating a round with players A, B, C as user A pings B and C (not A).
- [ ] Adding player D mid-round (issue #3 endpoint) pings D and nobody else.
- [ ] Notification deep-links to the live scorer.
- [ ] `round_invite` preference appears in the notification preferences UI, defaulting on.
- [ ] Sim mode never sends real pushes.
- [ ] Notification failures don't fail the round creation request.
- [ ] CLAUDE.md + README updated.

## Verification Checklist

1. **Initial roster ping**: User A creates a round with A, B, C. B and C receive a push within seconds. A does not.
2. **Add-player ping**: A round exists with A, B. A adds D via the new endpoint. D receives a push. A and B do not.
3. **Deep link**: Tap the push on B's device → app opens to `/my-rounds/rounds/{round_id}/live` and the live scorer loads with B's roster + tees.
4. **Completed round redirect**: If the round is completed by the time B taps, B lands on `/my-rounds` (existing redirect).
5. **Preference respected**: B turns off `round_invite` in settings. A new round including B doesn't ping B.
6. **Sim mode quiet**: Admin in simulator mode creates a round as User X. No real device receives the X-targeted push.
7. **Resilience**: Force a notification-service error (e.g., bad creds). Confirm the round is still created successfully and the error is logged but not surfaced to the user.
