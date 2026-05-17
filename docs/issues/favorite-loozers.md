# Feature: Favorite Loozers

## Overview

While every Loozer is family, most of us have a smaller circle we play with weekly, hang out with on weekends, and just want to pay closer attention to. Today the app treats everyone equally — every photo upload, every round, every accolade is just one of many in the firehose.

This feature lets each Loozer mark others as **favorites**, opt into per-favorite notifications (round started, hole completed, round finished, photo uploaded), and leave comments on **any** Loozer's completed scorecard to razz, congratulate, or encourage them.

Two related but distinct sub-features ship together:
1. **Favorites + per-favorite notification preferences** — who you follow and what pings you get
2. **Scorecard comments** — comment threads on any completed round, open to all Loozers regardless of favorite status

## User Experience

### Marking a favorite

A small outline heart sits in the **top-right corner** of every Loozer card on `/loozers` (both Grid and Tree views) and on every Loozer profile page (`/loozers/[userId]`). The heart is hidden on your own card/profile.

- **Outline heart** = not a favorite
- **Filled heart** = favorite

**Tap behavior** (same on cards and profile):
- Tapping the heart opens a `BottomDrawer` titled "Following [Name]"
- The drawer shows the Loozer's avatar + name and a list of checkbox preferences (see below)
- Closing the drawer saves the favorite (if it didn't already exist) with whatever boxes are checked
- For existing favorites, the same drawer opens to edit prefs and contains a destructive **"Unfavorite [Name]"** button at the bottom

Defaults (when first favoriting):
- ✅ Notify me when they **start a live scoring round**
- ✅ Notify me when they **complete each hole** (coalesced per-request — see Notification Coalescing)
- ✅ Notify me when they **complete a round**
- ✅ Notify me when they **upload a photo to the gallery**
- ✅ Notify me when **someone comments on their scorecard**

The heart is purely a tap target — no long-press, no swipe. One gesture, one effect.

### Scorecard comments

On every round's scorecard view (`/my-rounds/rounds/[id]` and any future shared scorecard surface), a comments thread appears below the score grid. Comments work on **in-progress and completed** rounds — saying "Nice birdie!" mid-round is half the point.

- Anyone (any signed-in Loozer) can post a comment
- Comments are short (≤500 chars), text-only in v1 (no GIFs, no images — keep scope tight)
- The scorecard owner is notified on every new comment (regardless of favorite status)
- Users who have favorited the scorecard owner AND have **"someone comments on their scorecard"** enabled also get notified
- You can delete your own comment; admins can delete any comment
- Comments persist on the round indefinitely

## Data Model

### New tables

```sql
CREATE TABLE user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  favorite_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notify_round_started BOOLEAN NOT NULL DEFAULT TRUE,
  notify_hole_completed BOOLEAN NOT NULL DEFAULT TRUE,
  notify_round_completed BOOLEAN NOT NULL DEFAULT TRUE,
  notify_photo_uploaded BOOLEAN NOT NULL DEFAULT TRUE,
  notify_scorecard_comment BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, favorite_user_id),
  CHECK (user_id <> favorite_user_id)
);
CREATE INDEX idx_user_favorites_favorite ON user_favorites(favorite_user_id);

CREATE TABLE round_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) > 0 AND length(body) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ
);
CREATE INDEX idx_round_comments_round ON round_comments(round_id, created_at);
```

### RLS

- `user_favorites`: read/write your own rows only (`user_id = auth.uid()`); the fan-out queries run server-side via the service role so other users' favorites stay private.
- `round_comments`: any authenticated Loozer can read all comments on any completed round; you can insert/delete only your own row; admins can delete any row.

### Migration

`00151_favorites_and_round_comments.sql` — creates both tables, indexes, and RLS policies.

## API Endpoints

### Favorites

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/favorites` | List current user's favorites with preferences. Includes basic Loozer info (id, display_name, avatar_url). |
| POST | `/api/favorites` | Add a favorite. Body: `{ favorite_user_id, preferences? }`. Idempotent — `ON CONFLICT (user_id, favorite_user_id) DO UPDATE`. |
| PUT | `/api/favorites/{favoriteUserId}` | Update preferences. Body: `{ notify_round_started?, notify_hole_completed?, notify_round_completed?, notify_photo_uploaded?, notify_scorecard_comment? }`. |
| DELETE | `/api/favorites/{favoriteUserId}` | Unfavorite. |

### Round comments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rounds/{roundId}/comments` | List comments on a round (ordered by `created_at` ascending). Includes sender `{id, display_name, avatar_url}`. Returns 404 for non-completed rounds. |
| POST | `/api/rounds/{roundId}/comments` | Post a comment. Body: `{ body: string }`. 422 on rounds where `status != 'completed'`. |
| DELETE | `/api/rounds/{roundId}/comments/{commentId}` | Delete a comment (own only, or admin). |

## Scope: Personal Rounds Only

**Favorites notifications and scorecard comments apply only to personal/summer rounds — not KGB Cup play and not Golfapalooza scrambles.**

The scoping is natural: KGB Cup uses its own tables (`kgb_cup_hole_scores`, `kgb_cup_player_handicaps`, `kgb_cup_pair_handicaps`) and the scrambles use `scramble_scores`. None of those flow through `/api/rounds` or the `rounds` table. Since every favorites hook (round_started, hole_completed, round_completed) and the comments thread are wired to the `rounds` table, event-time play is already excluded.

This issue does **not** add favorites notifications or comments to KGB Cup or scramble scoring surfaces. Photo uploads, however, continue to ping followers regardless of when/where they were taken — gallery is gallery.

## Notification Fan-out

A new helper `src/lib/favorites/fanout.ts` wraps the lookup-and-notify pattern so each call site is one line:

```ts
await notifyFollowersOf(userId, "round_started", { round_id, course_name });
```

The helper:
1. Selects `user_id` from `user_favorites` where `favorite_user_id = $1 AND notify_round_started = TRUE`
2. Builds a notification payload with type `favorite_<event>` and a deep link in `data`
3. Calls `sendBulkNotifications(followerIds, payload)`

### Hook points

| Event | Where | Notes |
|-------|-------|-------|
| `round_started` | `POST /api/rounds` after row insert | One ping per follower. Title: "[Name] started a round at [Course]." |
| `hole_completed` | `PUT /api/rounds/{id}/scores` | Compare submitted scores against existing rows; only fire on null→value transitions (not edits or re-saves). Coalesced per request — see Notification Coalescing below. Skip if the round was created less than 30 seconds ago to avoid double-firing alongside round_started. |
| `round_completed` | `POST /api/rounds/{id}/complete` | One ping per follower. Title: "[Name] finished with a [score]." |
| `photo_uploaded` | `POST /api/gallery` after row insert | One ping per follower of the uploader. |
| `scorecard_comment` | `POST /api/rounds/{id}/comments` | Always notify the scorecard owner. Also notify followers of the owner who have `notify_scorecard_comment = TRUE`. Do NOT notify the commenter. |

### Notification Coalescing (hole_completed)

The realistic noisy case: you favorite four people who are all playing in the same Saturday foursome. Naïvely each hole produces four push notifications. To keep that sane:

**Per-request coalescing.** `PUT /api/rounds/{id}/scores` accepts batch updates. For each request, the server:

1. Diffs incoming scores against existing rows to find null→value transitions
2. Groups transitions by **follower** (anyone with `notify_hole_completed = TRUE` for any of the players whose scores changed)
3. Emits **one** notification per follower summarizing every transition they care about

Example: a foursome with Randy, Steve, Bob, Joe; you follow Randy + Steve. Scorer batches hole 5 for all four players in one PUT. You get one push:
> **Hole 5** — Randy: 4 (birdie), Steve: 3 (eagle)

Not two pushes, not four. The notification body lists each followed player with their score and a label (`eagle` / `birdie` / `par` / `bogey` / `double+`). The `data` payload includes the round_id so tapping deep-links into the scorecard.

**Cross-request coalescing is out of scope for v1.** If a scorer enters hole 5 one player at a time across four separate requests, the follower gets four pushes. We'll watch real-world usage and consider a 30s server-side buffer as a follow-up if it's actually a problem.

### Notification payload shape

```ts
{
  type: "favorite_round_started" | "favorite_hole_completed" | "favorite_round_completed" | "favorite_photo_uploaded" | "favorite_scorecard_comment",
  title: "Jeff started a round at Alpine Lake",
  body?: optional contextual line (e.g., "Hole 4 — par 3, scored 2"),
  data: {
    actor_user_id: string,
    round_id?: string,
    hole_number?: number,
    gallery_item_id?: string,
    comment_id?: string,
    deep_link: string  // e.g., "/loozers/{actor_user_id}" or "/my-rounds/rounds/{round_id}"
  }
}
```

## Surface Area

### New files

- `supabase/migrations/00151_favorites_and_round_comments.sql`
- `src/app/api/favorites/route.ts` (GET, POST)
- `src/app/api/favorites/[favoriteUserId]/route.ts` (PUT, DELETE)
- `src/app/api/rounds/[id]/comments/route.ts` (GET, POST)
- `src/app/api/rounds/[id]/comments/[commentId]/route.ts` (DELETE)
- `src/lib/favorites/fanout.ts` — `notifyFollowersOf(actorId, event, data)`
- `src/components/favorites/FavoriteHeartButton.tsx` — the heart icon + drawer trigger
- `src/components/favorites/FavoritePreferencesDrawer.tsx` — BottomDrawer + form
- `src/components/scoring/RoundComments.tsx` — list + composer for a round
- `src/types/golf.ts` — add `UserFavorite`, `RoundComment` types

### Files to modify

- `src/components/LoozersList.tsx` — drop `<FavoriteHeartButton>` into the absolutely-positioned top-right of each card (both Grid and Tree views)
- `src/components/LoozerProfile.tsx` — same button in the profile header
- `src/components/my-rounds/ScorecardView.tsx` — render `<RoundComments>` below the score grid for completed rounds
- `src/app/api/rounds/route.ts` (POST) — call `notifyFollowersOf(...) "round_started"`
- `src/app/api/rounds/[id]/scores/route.ts` (PUT) — diff incoming vs. existing scores, call `notifyFollowersOf(...) "hole_completed"` for each null→value hole
- `src/app/api/rounds/[id]/complete/route.ts` — call `notifyFollowersOf(...) "round_completed"`
- `src/app/api/gallery/route.ts` (POST) — call `notifyFollowersOf(...) "photo_uploaded"`
- `CLAUDE.md` — add endpoints, tables, and migration to the reference sections
- `README.md` — note the new Favorites + scorecard comments capabilities

## Edge Cases & Constraints

- **Self-favoriting blocked** at DB (CHECK) and API layers.
- **Deleting a user** cascades to both `user_favorites` rows (as `user_id` or `favorite_user_id`) and their `round_comments`.
- **Financial-only / system users** are excluded from favorite pickers and never appear in the heart-icon surface (consistent with how they're hidden elsewhere).
- **The `getEffectiveUserId(user.id)` rule** applies to every new endpoint — admin simulator must work for favorites and comments.
- **Hole-completed dedup**: when `PUT /scores` is called multiple times for the same hole (correction, partial save, etc.), only the first null→value transition emits a notification. Edits do not re-notify.
- **Round creation race**: skip `hole_completed` notifications for the first 30 seconds after a round is created so the initial bulk save doesn't fire 18 pings stacked behind the `round_started` ping.
- **Spectator page**: no favorites, no comments — consistent with the "nothing personalized on spectator" rule.
- **Notification stacking**: per-hole notifications are coalesced per-request by follower (see Notification Coalescing). The preferences drawer notes "can be noisy" next to the per-hole checkbox so users opting in know what they're signing up for.
- **Event play is excluded**: KGB Cup and scramble scoring use separate tables and APIs; the favorites notification hooks and the comments thread are wired to the personal `rounds` table only. No code needs to explicitly filter event rounds — the scope is set by which endpoints we hook.

## Out of Scope (Possible Follow-ups)

- **Reciprocal favorites** — "X people follow you" indicator on profile
- **Activity feed surface** — `/feed` showing recent activity by favorites (vs. relying entirely on notifications)
- **Comment reactions / GIFs / images** — keep v1 text-only
- **Mid-round comments** — currently gated to completed rounds; could open up later
- **Bulk follow** ("favorite everyone in my tee group")
- **Notification digests** — daily summary instead of real-time, for noisy followers

## Acceptance Criteria

- [ ] Heart icon visible top-right on every Loozer card in `/loozers` (Grid + Tree) and on each profile, hidden on own card/profile
- [ ] Tapping an empty heart opens the preferences drawer with default checkboxes; closing saves the favorite
- [ ] Tapping a filled heart opens the same drawer with current prefs; an "Unfavorite" button removes the row
- [ ] Migration `00151_favorites_and_round_comments.sql` creates both tables with the RLS policies described
- [ ] `GET/POST/PUT/DELETE` favorite endpoints work and respect `getEffectiveUserId`
- [ ] Round-started, round-completed, hole-completed (null→value only), and photo-uploaded notifications fire to the right followers based on prefs
- [ ] Scorecard owners get notified on every comment on their completed round
- [ ] Favorites-with-notify-scorecard-comment-on also get pinged when someone comments on a favorite's scorecard
- [ ] Comments can be posted, deleted by sender or admin, and are visible to all authenticated Loozers
- [ ] CLAUDE.md and README.md updated
- [ ] Spectator page shows no hearts and no comments

## Verification Checklist

1. **Favorites happy path:** From a clean state, tap heart on a Loozer card → drawer opens with defaults → close → page refresh → heart is filled.
2. **Edit prefs:** Tap a filled heart → toggle "hole completed" on → close → reopen → checkbox state persisted.
3. **Unfavorite:** Open drawer → tap "Unfavorite" → drawer closes → heart returns to outline → DB row deleted.
4. **Self-favorite blocked:** Confirm heart icon doesn't render on your own card or profile. Hit `POST /api/favorites` with your own id → 422.
5. **Round-started ping:** As user B, favorite user A with round_started ON. As user A, start a round. Confirm user B receives a push.
6. **Per-hole ping (null→value only):** As user A, score hole 1. Confirm user B (with per-hole ON) gets one ping. Edit hole 1's score → no new ping. Score hole 2 → one new ping.
7. **Round-completed ping:** As user A, complete the round. Confirm user B gets the round_completed ping.
8. **Photo ping:** As user A, upload to gallery. Confirm user B gets the photo_uploaded ping.
9. **Comment notifies owner:** As user C, comment on user A's completed scorecard. Confirm user A gets the comment ping (even though A hasn't favorited C).
10. **Comment notifies followers of owner:** As user C, comment on A's scorecard. Confirm user B (who follows A with comment-pings on) also gets pinged. Confirm user C (the commenter) does NOT.
11. **Comments work on in-progress rounds:** Visit an in-progress round → composer renders → post "nice birdie" → owner receives a notification mid-round.
12. **Hole-completed coalescing:** As scorer for a 4-player round, batch hole 5 for all four players in one save. As a follower of two of those players, confirm you receive exactly **one** push that mentions both players and their scores (not two pushes).
13. **Event scoring excluded:** As a follower with all prefs on, watch a KGB Cup match or scramble round progress. Confirm **zero** favorites notifications fire from those scoring surfaces.
14. **Admin can delete any comment.** As admin, delete another user's comment → it disappears.
15. **User deletion cascades:** Delete a test user → confirm their `user_favorites` (both directions) and `round_comments` rows are gone.
16. **Spectator parity:** Open `/spectator` while logged out → no hearts, no comments.
17. **Migration applied:** Confirm `00151` is in `schema_migrations` and both tables exist with the right columns and indexes.
