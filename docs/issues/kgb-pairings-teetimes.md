## Summary

Two bugs in KGB Cup pairings were fixed live during the run-up to Golfapalooza XXX (event ~1 month out); a third, larger architectural gap — pairing changes not propagating to tee times — is **deferred to post-event**. This year we work around it manually. This issue records all three for the "reinvent afterwards" pass.

Files: `src/components/admin/RyderCupManager.tsx`, `src/app/api/admin/ryder-cup/pairs/*`, `src/app/api/admin/tee-times/route.ts`, `src/components/admin/TeeTimeManager.tsx`, `src/lib/kgb-cup/derive-foursomes.ts`.

---

## Background: the KGB Cup pairing data model

- `ryder_cup_teams` — two teams per `ryder_cup` contest.
- `ryder_cup_pairs` — rows with `player_a_id`, `player_b_id`, `player_c_id` (C = optional 3rd for uneven teams) and a `sort_order`.
  - `sort_order = 0` → **pool row**: a *single-player holder*. Only `player_a` is ever surfaced to the pair-placement picker.
  - `sort_order > 0` → **real pair**: a fillable pair card in Step 2.
- **Foursomes** are derived live (`derive-foursomes.ts`) by matching a Team-1 pair to the Team-2 pair with the same `sort_order`.

---

## Bug 1 — "Add Players" drawer stranded players in pool rows (FIXED)

**Symptom:** Enrolled golfers (Dosky, Bubbles at Golfapalooza XXX) were on their teams but invisible/unplaceable in the pair picker.

**Cause:** `closeAddPlayersDrawer` in `RyderCupManager.tsx` scanned *all* of a team's pairs for empty slots — including pool rows (`sort_order = 0`) — and filled their empty `player_b`. But a pool row is a single-player holder: the Step 2 picker only ever reads `poolPair.player_a` (and `onPickPlayer` places `player_a`). So a player dropped into a pool row's `player_b` was enrolled, counted "on team," but permanently unplaceable.

**Repro:** Assign player X to a team (creates pool row, `player_a=X`, `player_b` empty) → later open "+ Add Players" and add player Y → Y lands in X's pool row `player_b` → Y never appears in the pair picker.

**Fix applied:** Skip pool rows (`if (pair.sort_order === 0) continue;`) when computing open slots in `closeAddPlayersDrawer`.

**Data repair applied (live, Golfapalooza XXX):** Moved the two stranded `player_b` occupants into their own single-player pool rows; deleted one empty leftover pool row. No stranded players remain.

## Bug 2 — "+ New Pair" button hidden when players still pooled (FIXED)

**Symptom:** Could not create a 10th pair for the final 4 golfers even though players were sitting in the pool.

**Cause:** The button's visibility was `poolPairs.length > emptySlots`, where `emptySlots` counted every pair's optional `player_c` slot as open. With 9 pairs each showing a phantom open C slot, the app believed there was ample room and hid the button.

**Fix applied:** Count only the standard A/B slots when computing `emptySlots` (C is the optional 3rd-player slot; treating every open C as available suppresses the button while players are pooled).

**Data workaround applied (live):** Manually created an empty Pair 10 on both teams so the admin could finish this year's pairings without waiting on a deploy.

> Both code fixes are committed to `RyderCupManager.tsx` and take effect on next deploy. Until deployed, avoid the Step 1 "+ Add Players" drawer (it can re-strand a player); use chip batch-assign / Step 2 placement instead.

---

## Deferred (post-event) — pairing changes do NOT propagate to tee times

**This is the "reinvent afterwards" item. No fix this year — handle manually.**

### The gap

- **Scramble** tee times use a *live link* (`tee_times.scramble_team_id`); members derive fresh on read.
- **KGB Cup** tee times use a *snapshot*: `POST /api/admin/tee-times` with `kgb_foursome_id` copies the pair members' `user_id`s into `tee_time_players` at creation time. There is **no** `ryder_cup_pair_id` column on `tee_times` — the link to the pairing is not persisted.

### Consequence of changing a pairing after its tee time exists

1. The tee time keeps the **old snapshot** (stale player, missing the new one).
2. `getUnassignedKgbFoursomes` (TeeTimeManager) decides "assigned?" by checking whether *all* the derived foursome's members appear in some `tee_time_players` row. After a swap, the new player is in no group, so the **updated foursome reappears in "Unassigned Foursomes"** — re-dragging it double-books/duplicates the group.

### Why we can't just make KGB groups "virtual"

`tee_time_players` is the materialized source of truth for many downstream consumers: KGB scoring (`kgb-cup/scoring`), the spectator tee sheet, "my tee time" (home), the schedule page, and the tee-time reminder cron all read it directly. Deriving-on-read with no rows would break all of these. So the fix must **keep `tee_time_players` materialized** and re-sync it.

### Proposed approach (post-event)

1. **Add `tee_times.ryder_cup_pair_id`** (store the Team-1 pair id, mirroring `scramble_team_id`). Lets us know which tee time descends from which foursome and makes the "assigned?" check an id match instead of fuzzy all-members-present.
2. **Cascade on pairing writes** — in the ryder-cup pairs `PUT`/`POST`/`DELETE` + `placePlayerIntoPair` paths, after a change, find any linked `tee_time` (either side of the `sort_order` match) and rewrite its `tee_time_players` to the current 4–6 players. Fire a `window.dispatchEvent` so an open TeeTimeManager refreshes. (Same cross-table-consistency pattern as the contest-participant → scramble-team cascade in CLAUDE.md.)

### Design wrinkles to resolve before building

- A foursome spans **two pairs** (Team 1 + Team 2, matched by `sort_order`). A swap on either side — or reassigning a pair's `sort_order` — changes the foursome; the cascade must recompute from both.
- **Scoring-in-progress guard (critical):** if a swap happens after `kgb-cup/scoring` has written scores keyed to `tee_time_players`/`user_id`, silently rewriting the group could strand or misattribute scores. Block the swap or warn (like the guarded attendance-sync removal).
- **Partial placement:** foursome split across tee times, or only some members placed — define behavior (likely: only re-sync groups fully derived from the linked pair).

### This year's manual workaround

After changing any pairing, **delete and re-create the affected KGB tee-time group** so its snapshot matches. Watch for a foursome reappearing in "Unassigned Foursomes" after a swap — that's the stale-snapshot signal.

---

## Acceptance criteria (post-event)

- [ ] Bugs 1 & 2 verified fixed in production (deployed).
- [ ] `tee_times.ryder_cup_pair_id` migration added (with Data API grant).
- [ ] Pairing edits re-sync linked tee-time `tee_time_players`; open TeeTimeManager refreshes.
- [ ] Scoring-in-progress guard prevents silent score misattribution.
- [ ] "Assigned?" check uses the link, not membership matching.
- [ ] README / help drawer updated.
