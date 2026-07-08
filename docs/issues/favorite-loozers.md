# Feature: Favorite Loozers (watch live rounds + live comments)

**Phase:** Social / Live Scoring
**Related:** #132 (Live Scoring Realtime Sync), #131 (Round Invite Notifications), #14 (closed — generic friends system, out of scope)

> Supersedes the May-16 draft. Reconciled with the current spec: 3 notification toggles (not 5), **live** comments (not completed-only), a read-only spectator view, and a home-page "Live Now" list. Notification coalescing and the per-favorite model carry over from the earlier draft.

## Problem

Every Loozer is family, but most of us have a smaller circle we actually want to keep tabs on. Today the app treats everyone equally, and you can't watch a round unfold unless you're on its roster. We want a lightweight, **one-way** "favorite" relationship that drives live watching, notifications, and in-round commentary — without the weight of a bidirectional friends/blocking system.

## Overview

A user can **favorite** any Loozer (a star on their profile, on a scorecard, or on a `/loozers` card). Favoriting is **silent and one-way** — the favorited Loozer is never told and can't see who favorited them.

Favoriting drives per-favorite notifications and easy live-watching. Two things ship together but are independent:
1. **Favorites + per-favorite notification preferences** — who you watch and what pings you.
2. **Live round comments** — anyone watching an in-progress round can comment as it happens; open to all Loozers regardless of favorite status.

Plus one public surface not gated on favoriting:
3. **Live Now on the home page** — every in-progress *individual* round is listed for any Loozer to watch.

## Decisions (confirmed with product)

- **Notification toggles: 3** — **Rounds Played** (fires when they *start* a live round, so you can go watch), **Hole-by-Hole Updates** (fires as they card holes), **Round Finished** (fires on completion with their score). Defaults all ON. (Photo-upload and comment-on-card pings from the old draft are dropped.)
- **Watch surface:** a NEW **read-only live scoreboard** spectator view — NOT the existing score-entry `/live` page (that stays roster-only for editing).
- **Hole cadence:** fires on the **first score recorded for a hole**, not on edits/re-saves. Coalesced per request (see below).
- **Reciprocity:** silent / one-way. No "X favorited you," no follower counts.
- **Live Now scope:** all in-progress **individual** rounds (`format='individual'`, `status='in_progress'`), watchable by any signed-in Loozer. Trip scrambles keep their own home treatment — out of scope here.
- **Star placement:** Loozer profile header, round/scorecard view, AND every `/loozers` card (Grid + Tree). Hidden on your own card/profile.
- **Comments:** any signed-in Loozer, any round, **any time** — there is NO round-status gate. Comment mid-round to razz a birdie, or years later on a historical card. Text-only in v1. Reuse the proven `gallery_comments` / `MediaComments` pattern with realtime.
- **Scope:** personal `rounds` only. KGB Cup (`kgb_cup_*`) and scrambles (`scramble_scores`) use separate tables/APIs and never flow through `/api/rounds`, so they're naturally excluded — no explicit filtering needed.

## UX Flow

### Favoriting
- **Star toggle** (outline → filled) on: profile header (`LoozerProfile.tsx`), each `/loozers` card (`LoozersList.tsx`, Grid + Tree, top-right), and next to roster players on the round/scorecard view.
- Tapping an empty star opens a **BottomDrawer** ("Following [Name]") with the three notification toggles (all ON by default); closing saves the favorite. Re-opening for an existing favorite edits prefs and shows a destructive **"Unfavorite [Name]"** button.
- One gesture, one effect. No long-press/swipe. Optimistic; reverts on API failure.
- Self-favorite blocked (star hidden on own surfaces + DB CHECK + API guard).

### Watching
- Home gains a **Live Now** section: all in-progress individual rounds (player avatar + name, course, thru-N, score-to-par). Each links to the spectator view.
- Notification deep-links open the same spectator view: `/rounds/{id}/watch`.
- Spectator view = read-only realtime scorecard/leaderboard via `subscribeToRound`, plus the live comments panel. Loads for completed rounds too (historical, no longer live-updating); Live Now drops a round on `status='completed'`.

### Commenting
- On the spectator view, a comments feed (newest at bottom, autoscroll — adapted from `MediaComments`) with a text input. New comments broadcast in realtime to everyone watching. Roster players get a best-effort `round_comment` push. Delete your own; admins delete any.

## Data Model

### Migration 00163 — `user_favorites`
```sql
CREATE TABLE user_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,           -- the favoriter
  favorite_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- the watched Loozer
  notify_round_started   boolean NOT NULL DEFAULT true,  -- "Rounds Played"
  notify_hole_completed  boolean NOT NULL DEFAULT true,  -- "Hole-by-Hole Updates"
  notify_round_completed boolean NOT NULL DEFAULT true,  -- "Round Finished"
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, favorite_user_id),
  CHECK (user_id <> favorite_user_id)
);
CREATE INDEX idx_user_favorites_favorite ON user_favorites(favorite_user_id); -- fan-out lookup
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_favorites TO authenticated, service_role;
```
RLS: read/write your own rows only (`user_id = auth.uid()`). Fan-out runs server-side via service role so the favorited person can NEVER see who favorited them (silent).

### Migration 00164 — `round_comments`
Mirror `gallery_comments`:
```sql
CREATE TABLE round_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) > 0 AND length(body) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_round_comments_round ON round_comments(round_id, created_at ASC);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE round_comments TO authenticated, service_role;
```
RLS: any authenticated Loozer reads all comments on any round; insert/delete your own; admins delete any. Add `round_comments` to the realtime publication for `onComment`.

## API Endpoints
All use `getEffectiveUserId`, `@swagger`-annotated, tags `Loozers` / `Rounds`.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/favorites` | My favorites + prefs + basic Loozer info (id, display_name, avatar_url). |
| POST | `/api/favorites` | Add. Body `{ favorite_user_id, preferences? }`. Idempotent (`ON CONFLICT DO UPDATE`). |
| PUT | `/api/favorites/{favoriteUserId}` | Update the 3 notify flags. |
| DELETE | `/api/favorites/{favoriteUserId}` | Unfavorite. |
| GET | `/api/rounds/live` | All in-progress individual rounds for Live Now (player, course, thru, to-par). Select only needed cols. |
| GET | `/api/rounds/{id}/comments` | List (created_at ASC) with sender `{id, display_name, avatar_url}`. |
| POST | `/api/rounds/{id}/comments` | Add. Body `{ body }`. No round-status gate — allowed on any round regardless of `status`. |
| DELETE | `/api/rounds/{id}/comments/{commentId}` | Delete (own or admin). |

## Notification Fan-out

New helper `src/lib/favorites/fanout.ts`:
```ts
await notifyFollowersOf(actorUserId, "round_started" | "hole_completed" | "round_completed", data);
```
1. Selects favoriters where `favorite_user_id = actor AND notify_<event> = TRUE`.
2. Builds payload type `favorite_<event>` with a deep link in `data`.
3. Calls `sendBulkNotifications` (simulator suppression inherited; best-effort).

### Hook points
| Event | Where | Notes |
|---|---|---|
| `round_started` | `POST /api/rounds` after insert | Guard `format='individual'`, `status='in_progress'`. Deep-link `/rounds/{id}/watch`. |
| `hole_completed` | `POST /api/rounds/{id}/scores` | Only null→value transitions (first score per hole), never edits. Skip guests (`user_id IS NULL`). Coalesced per request. Skip first 30s after round creation to avoid stacking behind `round_started`. |
| `round_completed` | `PUT /api/rounds/{id}` `{status:'completed'}` | One ping per follower with final score. Deep-link `/rounds/{id}/watch`. |
| `round_comment` | `POST /api/rounds/{id}/comments` | Best-effort push to roster players (except commenter). Deep-link `/rounds/{id}/watch`. |

### Hole coalescing
`POST /scores` accepts batches. Per request: diff incoming vs existing for null→value transitions, group by follower, emit **one** push per follower summarizing every followed player's hole (e.g. *"Hole 5 — Randy: 4 (birdie), Steve: 3 (eagle)"*). Cross-request coalescing is out of scope for v1 (revisit with a 30s buffer if noisy in practice). **Perf:** look up favoriters once per request and reuse across holes; batch the fan-out.

### Payload shape
```ts
{
  type: "favorite_round_started" | "favorite_hole_completed" | "favorite_round_completed" | "round_comment",
  title: "Jeff started a round at Alpine Lake",
  body?: "Hole 5 — Randy: 4 (birdie), Steve: 3 (eagle)",
  data: { actor_user_id, round_id, hole_number?, comment_id?, url: "/rounds/{round_id}/watch" }
}
```

## Surface Area

### New files
- `supabase/migrations/00163_user_favorites.sql`, `00164_round_comments.sql`
- `src/app/api/favorites/route.ts` (GET, POST), `.../[favoriteUserId]/route.ts` (PUT, DELETE)
- `src/app/api/rounds/live/route.ts` (GET)
- `src/app/api/rounds/[id]/comments/route.ts` (GET, POST), `.../[commentId]/route.ts` (DELETE)
- `src/app/(app)/rounds/[id]/watch/page.tsx` — spectator view
- `src/lib/favorites/fanout.ts`
- `src/components/favorites/FavoriteStarButton.tsx`, `FavoritePreferencesDrawer.tsx`
- `src/components/rounds/LiveScoreboard.tsx` — read-only realtime scorecard
- `src/components/rounds/RoundComments.tsx` — adapted from `MediaComments`, with realtime
- `src/types/golf.ts` — `UserFavorite`, `RoundComment`

### Files to modify
- `src/components/LoozersList.tsx`, `src/components/LoozerProfile.tsx`, round/scorecard view — drop in `<FavoriteStarButton>`
- `src/components/HomeContent.tsx` + `src/app/(app)/page.tsx` — Live Now section (data from `/api/rounds/live`)
- `src/lib/realtime/round-channel.ts` — add `onComment` for `round_comments`
- `src/app/api/rounds/route.ts`, `.../[id]/scores/route.ts`, `.../[id]/route.ts` — fire fan-out hooks
- `CLAUDE.md`, `README.md` — document tables, endpoints, migrations, capabilities

## Edge Cases & Constraints
- **Hole edits never re-fire** — only first score per `(round_player_id, hole)`.
- **Guests** (`round_players.user_id IS NULL`) never trigger notifications; skipped in scoring fan-out.
- **Scramble rounds** (`format='scramble'`) excluded from Live Now + all fan-out (one team card fanned to every player = noisy/wrong).
- **Self-favorite** blocked at DB (CHECK) + API + hidden UI.
- **User deletion** cascades both `user_favorites` directions and `round_comments`.
- **Financial-only / system users** excluded from favorite surfaces (consistent with elsewhere).
- **Round creation race** — skip `hole_completed` for 30s post-creation so bulk initial saves don't stack behind `round_started`.
- **Privacy** — favorited person can't query who favorited them (RLS + server-side fan-out).
- **Completed round** — spectator view still loads read-only; Live Now drops it on completion.
- **Spectator/public home** (`SpectatorHomeContent.tsx`) — NO Live Now, no stars, no comments (keep live individual rounds behind auth; consistent with "nothing personalized on spectator").
- **`getEffectiveUserId`** on every new endpoint (admin simulator).

## Out of Scope (Follow-ups)
- Reciprocal indicator ("N people follow you"), activity feed (`/feed`), comment reactions/GIFs/images, bulk-follow a tee group, notification digests, cross-request hole coalescing, favorites for KGB Cup / scramble surfaces.

## Acceptance Criteria
- [ ] Star visible on profile, `/loozers` cards (Grid + Tree), and scorecard; hidden on own surfaces.
- [ ] Empty star → drawer with 3 default-ON toggles; closing saves the favorite.
- [ ] Filled star → drawer edits prefs; "Unfavorite" removes the row.
- [ ] Migrations `00163` + `00164` create both tables with grants + RLS as described.
- [ ] Favorite CRUD endpoints work and respect `getEffectiveUserId`.
- [ ] `round_started`, `hole_completed` (null→value only, coalesced), and `round_completed` fire to the right followers per prefs.
- [ ] Notification deep-links open a working read-only spectator view that updates in realtime.
- [ ] Home Live Now lists all in-progress individual rounds; each opens the spectator view.
- [ ] Anyone watching can post a comment; it appears in realtime for all watchers; roster players get a `round_comment` push.
- [ ] Favorited person cannot see who favorited them.
- [ ] Guests, scramble rounds, and event (KGB/scramble) play excluded from all of the above.
- [ ] Spectator page shows no stars/comments/Live Now.
- [ ] README + CLAUDE.md updated; both migrations run and grants verified.

## Verification Checklist
1. **Favorite happy path:** tap empty star → drawer with defaults → close → refresh → star filled.
2. **Edit prefs:** filled star → toggle Hole-by-Hole off → reopen → persisted.
3. **Unfavorite:** drawer → Unfavorite → star outline → row deleted.
4. **Self-favorite blocked:** no star on own profile/card; `POST /api/favorites` with own id → 422.
5. **Round-started ping:** B favorites A (round_started on). A starts an individual round → B pushed; tapping opens the spectator view live.
6. **Per-hole (null→value only):** A scores hole 1 → B (hole on) gets one ping. Edit hole 1 → no new ping. Score hole 2 → one ping.
7. **Coalescing:** score a 4-player round's hole 5 in one batch; follower of two players gets exactly one push naming both.
8. **Round-finished ping:** A completes → B (round_completed on) pushed with score.
9. **Live comments:** open A's in-progress round as C → post "nice birdie" → appears in realtime for all watchers; A's roster players get a `round_comment` push; C does not.
10. **Live Now:** home shows A's in-progress individual round; opens spectator view; disappears on completion.
11. **Privacy:** as A, confirm no API/UI reveals who favorited you.
12. **Exclusions:** guests, scramble rounds, and KGB/scramble scoring fire zero favorite notifications and don't appear in Live Now.
13. **Admin delete comment:** admin removes another user's comment.
14. **User deletion cascades:** delete a test user → their `user_favorites` (both directions) + `round_comments` gone.
15. **Spectator parity:** `/spectator` shows no stars/comments/Live Now.
16. **Migrations:** `00163` + `00164` in `schema_migrations`; tables, indexes, grants present.
