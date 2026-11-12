## Overview

Make v2 Squares live-update the same way Pick'em and Auction now do. Today Squares has **no realtime at all** — not the member detail board, not the home card. Everything is static until a manual reload or an unrelated navigation.

This surfaced while wiring the Pick'em home card to live-update (pot / "Final" badge / moneybag) and extending that to Auction. Pick'em and Auction both have realtime channels; Squares does not, so it was deliberately left out (see the note in `HomeCardsLive.tsx`). This issue closes that gap.

## Current state (why it can't live-update yet)

- **No channel helper.** `src/lib/v2/realtime/` has `pickem-channel.ts`, `auction-channel.ts`, `round-channel.ts` — no `squares-channel.ts`.
- **Detail board isn't subscribed.** `SquaresPlay.tsx` calls `router.refresh()` only as a post-write reconcile after the viewer's own action; it never listens for other people's changes.
- **Tables aren't published.** None of `v2_squares_cells` / `v2_squares_games` are in the `supabase_realtime` publication. (`v2_contests` already is, via migration `00286`, so phase/config changes are covered.)
- **Home card is static.** `SquaresHomeCards` is a server component with no refresher (Pick'em/Auction now mount `HomeCardsLive`).

## Technical plan

Mirror the Pick'em implementation end-to-end.

1. **Migration** — publish the squares tables with full replica identity so `contest_id`-filtered events (including DELETE, e.g. a cell cleared) match:
   - `ALTER TABLE public.v2_squares_cells REPLICA IDENTITY FULL;` + add to `supabase_realtime`.
   - `ALTER TABLE public.v2_squares_games REPLICA IDENTITY FULL;` + add to `supabase_realtime`.
   - `v2_contests` is already published (00286), so phase/lock/config changes already propagate.
   - Pattern reference: `supabase/migrations/00288_v2_contest_participants_realtime.sql`.

2. **Channel** — add `src/lib/v2/realtime/squares-channel.ts` with `subscribeToSquares(contestId, onChange)` listening to `v2_squares_cells`, `v2_squares_games`, and `v2_contests` (filtered by `contest_id` / `id`). Model on `pickem-channel.ts`.

3. **Detail board** — subscribe in `SquaresPlay.tsx` (or its page) and `router.refresh()` on change, so claims, grid-number reveals, locks, and live scores update for every connected viewer. Keep the existing dirty/optimistic reconcile so a viewer's in-flight action isn't clobbered.

4. **Home card** — extend `HomeCardsLive`'s `LiveContest` union with a `"squares"` type and subscribe via the new channel; mount the refresher from `SquaresHomeCards` (same shape as Pick'em/Auction). Remove the "Squares excluded" note from `HomeCardsLive.tsx` once done.

## Acceptance criteria

- [ ] Migration published + applied; the two squares tables show `REPLICA IDENTITY FULL` and are in `supabase_realtime`.
- [ ] A square claimed/cleared by one member appears/disappears on another member's **detail board** within ~1s, no reload.
- [ ] Grid-number reveal, game lock, and live-score changes propagate to open detail boards.
- [ ] The **home card** (yours/gone counts, badge, featured game) updates live, including the card appearing/disappearing.
- [ ] A viewer mid-action doesn't lose their in-flight claim when a background refresh lands.
- [ ] Channels unsubscribe on unmount (no leaks); bursts are coalesced (reuse the `HomeCardsLive` debounce).

## Notes

- Guiding principle from the user: anything that *can* receive live updates should live-update itself. This brings Squares in line with Pick'em and Auction.
- Reference implementation: Pick'em realtime (`pickem-channel.ts`, `HomeCardsLive.tsx`, migration `00288`).
