# Feature: Co-Equal Round Ownership

## Overview

Today, a round has a single `created_by` "owner" who alone can edit scores, mark the round complete, post-completion edit, delete the round, and (implicitly) manage the player roster. In practice, group scoring is a shared activity — any player in the foursome should be able to fix a missed stroke, complete the round on behalf of the group, add a late-arriving player, or correct a typo on someone else's card.

This issue makes every player in a round a **co-equal owner**. The `created_by` column stays (useful for "who started it" attribution and audit), but no surface gates on it anymore — gating switches to `isPlayerInRound(round_id, user_id)`.

## User Experience

### What changes

- **Edit Round** button on `/my-rounds/rounds/{id}`: visible to any player in the round (and admins). Previously creator-only.
- **Delete Round** button on `/my-rounds/rounds/{id}`: visible to any player in the round (and admins). Tapping prompts `ConfirmModal`: *"Delete this round? This removes scores for everyone in the group and can't be undone."* — destructive red button.
- **Complete Round** (live scorer): already accessible from the live URL — confirms the existing flow. PUT route gate widened to "any player or admin."
- **Add Player** (new): on the round detail page (and live scorer), an *"Add player"* action that surfaces a Loozer picker. Adding a player creates a `round_players` row and (per issue #2) sends them a push to open the round live. Available to any player in the round.
- **Remove Player** (new): swipe / tap-X on a `round_players` row → `ConfirmModal` *"Remove {Name} from this round? Their scores will be deleted."* → delete cascades to `round_scores`. Available to any player in the round (creator can be removed too — round survives as long as at least one player remains).

A round that ends up with zero players is auto-deleted by the remove endpoint (rare, but tidy).

### What stays the same

- `created_by` is still attributed on the round detail page (*"Started by Randy Watson"*).
- The `is_scorer` flag on `round_players` keeps its existing semantics for tee-time / scoring-rotation surfaces; this issue doesn't touch it.

## Surface Area

### API changes

| Method | Endpoint | Gate change |
|---|---|---|
| PUT | `/api/rounds/{id}` | Already opened to player-or-admin via the inline fix in the previous session. Keep. |
| DELETE | `/api/rounds/{id}` | Was RLS `created_by = auth.uid()`. Change to: any player in the round or admin. Use admin client + explicit check. |
| PUT | `/api/rounds/{id}/edit` (post-completion edit) | Was creator+admin. Change to: any player in the round or admin. |
| POST | `/api/rounds/{id}/scores` | Already player-aware via `round_players` lookup; double-check the post-completion gate (currently creator+admin) — open to any player. |
| POST | `/api/rounds/{id}/players` | **New.** Body `{user_id, tee_id?}`. Adds a `round_players` row. Triggers push (issue #2). Any player or admin. |
| DELETE | `/api/rounds/{id}/players/{playerId}` | **New.** Removes a `round_players` row + cascades scores. Any player or admin. If the last player is removed, also deletes the round. |

### Files

- `src/app/api/rounds/[id]/route.ts` — widen DELETE gate.
- `src/app/api/rounds/[id]/edit/route.ts` — widen edit gate.
- `src/app/api/rounds/[id]/scores/route.ts` — widen post-completion edit gate.
- `src/app/api/rounds/[id]/players/route.ts` — new POST handler.
- `src/app/api/rounds/[id]/players/[playerId]/route.ts` — new DELETE handler.
- `src/app/(app)/my-rounds/rounds/[id]/page.tsx` — replace `creatorIsMe` gate on Edit/Delete with `isPlayerInRound`. Add Add/Remove Player UI.
- `src/components/my-rounds/LiveScoringEntry.tsx` — surface the Add Player action; show a roster strip that allows tap-to-remove.
- `src/lib/rounds/access.ts` — new helper `canManageRound(roundId, userId)` returning `{ allowed: boolean; reason: "creator" | "player" | "admin" | "denied" }` so every gate uses the same check.
- `CLAUDE.md` — document the new endpoints, the gate change, and the "any player owns the round" rule.
- `README.md` — note that any player in a round can edit/complete/delete.

### RLS

`rounds` and `round_players` RLS stay as-is (still creator-bound) because the new flows route through the admin client behind explicit auth checks. This keeps direct PostgREST access safe.

## Edge Cases

- **Cycle**: a player removes themselves from a round they're scoring. The live page checks membership on each save; the next save returns 403 and the UI redirects to `/my-rounds`.
- **Concurrent delete**: two players hit Delete at the same time. The DELETE endpoint is idempotent (404 if already gone). UI shows a soft toast: *"Round already deleted."*
- **Removing the last player**: endpoint cascades to round deletion. UI shows a stronger confirmation copy: *"This is the last player. Removing them deletes the round."*
- **Admin simulator**: every new gate uses `getEffectiveUserId` so admin sim works.
- **History import attribution**: imported historical rounds may have `created_by` set to a system user. They're already `status='completed'`; this issue doesn't affect them.

## Out of Scope

- Notifying other players when someone deletes a round (could add later — for now, the destructive confirmation is the only safety net).
- Role tiers within a round (e.g., "owner + secondary scorers"). Co-equal is the design goal.
- Bulk-add-players UI (just the existing one-at-a-time picker for v1).

## Acceptance Criteria

- [ ] Any player in a round can edit scores, complete the round, post-completion edit, and delete the round.
- [ ] Delete shows a destructive `ConfirmModal` and removes the round + all child rows.
- [ ] New `POST /api/rounds/{id}/players` endpoint adds a player and is callable by any player in the round.
- [ ] New `DELETE /api/rounds/{id}/players/{playerId}` endpoint removes a player; if the last player, deletes the round.
- [ ] `creatorIsMe` is no longer gating any UI surface that mutates the round.
- [ ] CLAUDE.md + README updated.

## Verification Checklist

1. **Non-creator edit**: Player A creates a round with players A + B. Player B opens the round, sees Edit Round button, edits a score → save succeeds → score appears for both users.
2. **Non-creator complete**: Player B taps Complete Round on the live page → status flips to completed for everyone.
3. **Non-creator delete**: Player B taps Delete → confirmation modal → confirm → round disappears from both users' `/my-rounds`.
4. **Add player**: Mid-round, Player A adds Player C via the Add Player picker → `round_players` row created → Player C sees the round in their `/my-rounds`.
5. **Remove player**: Player A removes Player C → `ConfirmModal` → confirm → Player C's `round_players` row + scores deleted; round still exists for A + B.
6. **Remove last player**: Three-player round → players remove themselves one by one → final removal triggers round deletion with the stronger confirmation copy.
7. **Idempotent delete**: Two browsers hit Delete simultaneously → one succeeds, the other shows "Round already deleted" toast.
8. **Admin override**: An admin (not a player in the round) can still edit/complete/delete via the same UI.
9. **Sim mode**: Admin in simulator mode as Player B performs all of the above; everything works.
