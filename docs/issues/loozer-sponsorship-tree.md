## Overview

Every Loozer (except the founders) was brought into Golfapalooza by another Loozer — their sponsor. Capture that relationship in the data model, expose it in the admin UI, render it as a family tree on `/loozers`, and surface "Sponsor: Quack" on each loozer's profile page.

## Data Model

New migration `00111_loozer_sponsorship.sql`:

```sql
ALTER TABLE users
  ADD COLUMN is_founder boolean NOT NULL DEFAULT false,
  ADD COLUMN sponsor_id uuid REFERENCES users(id) ON DELETE RESTRICT;

CREATE INDEX idx_users_sponsor_id ON users(sponsor_id) WHERE sponsor_id IS NOT NULL;
```

**Rules (enforced in app, not DB):**
- Every active Loozer must have either `is_founder = true` OR a non-null `sponsor_id`. (Not enforced as a CHECK constraint to keep inserts simple — the admin UI is the gate.)
- A Loozer cannot sponsor themselves or any of their descendants (cycle prevention, client-side filtering of the picker).
- `ON DELETE RESTRICT` means a Loozer with sponsees can't be deleted until the sponsees are reassigned. Forces clean state.

**Backfill plan:**
- Migration leaves all existing rows at `is_founder = false`, `sponsor_id = null`.
- Admin manually toggles `is_founder = true` for the actual founding fathers in the admin UI.
- Admin then sets each non-founder's sponsor.
- During the transition, the admin UI shows a small banner: "N Loozers need their sponsor set." Tree view groups unsponsored non-founders into an "Unsponsored" bucket at the top, visually distinct from the actual trees.

## API Changes

**`PUT /api/admin/users`** — extend payload to accept `sponsor_id` and `is_founder`. When `is_founder = true`, force `sponsor_id = null`. When `sponsor_id` is set, force `is_founder = false`. Validate that the chosen sponsor isn't the user themselves or one of their descendants.

**`GET /api/admin/users`** — extend response to include `sponsor_id` and `is_founder` so the admin list can render the picker correctly.

**`GET /api/loozers`** — extend response to include `sponsor_id` and `is_founder` for tree rendering. Tree shape is computed client-side (only ~50 loozers; no need for a server-side tree endpoint).

## Admin UI — `UserManager.tsx`

In the existing edit modal, after the avatar/name section:

1. **Founding Father** toggle. When enabled, the sponsor picker is hidden and `sponsor_id` is cleared on save.
2. **Sponsor** picker (visible when not a founder). Searchable dropdown:
   - List of all loozers, each row showing avatar + display name
   - Filtered to exclude self and all descendants (computed client-side from the existing user list)
   - Search input on top, mirrors the `RoundForm.tsx` Loozer-search pattern
   - "Required" indicator if neither founder nor sponsor is set
3. **Save validation**: block save with an inline error if the user is non-founder with no sponsor.

## Loozer Profile Page — `/loozers/[userId]`

Add a single line near the top of the profile (before bio):

> **Sponsor:** [avatar] Quack

- If the user is a founder, show "Founding Father" with a small badge instead.
- If neither (transition state), show nothing.
- The sponsor's avatar + name link to their profile.

## Family Tree View — `/loozers`

Toggle on the existing `LoozersList` page: **Grid | Tree** (Grid is the default; persists in localStorage).

**Tree component:**
- Vertical org-chart style. Each node = avatar + display name in a small card.
- Multiple founders → multiple separate trees rendered top-to-bottom.
- "Unsponsored" bucket at the top during transition (loozers with no sponsor and not founders).
- Pan + pinch-zoom for mobile (the tree gets wide quickly with branching).

**Library choices:**
- `react-organizational-chart` for the tree (lightweight, pure-CSS rendering, custom nodes)
- `react-zoom-pan-pinch` for pan/zoom on touch and desktop

Both small, both well-suited to mobile. Will verify bundle size impact before committing.

**Initial focus**: when the tree view opens, it scrolls/pans so the current user's node is centered in the viewport. Their node is also visually highlighted (subtle ring) so they immediately see "where I sit." On the public spectator view (no current user), defaults to centering the first founder's tree.

**Tap behavior**: tapping a node navigates to that loozer's profile page.

## Spectator Page — `/spectator/loozers`

Same Grid | Tree toggle. Tree view available to the public. Uses `createAdminClient()` to bypass RLS (existing spectator pattern). Only public fields exposed: avatar, display name, sponsor relationship.

## Edge Cases

- **Loozer marked `is_active = false`** — they still appear in the tree (history matters), but their card is dimmed.
- **Sponsor change** — admin can reassign at any time. No history kept (out of scope for v1).
- **Trying to delete a sponsor** — RESTRICT throws; admin UI shows "Reassign N sponsees first" with a quick reassignment dialog (or just an error message pointing to the sponsees).
- **`is_financial_only` users** — excluded from the tree, the admin sponsor picker, and the "Sponsor: X" line on profiles. They have no sponsorship semantics.
- **Self-sponsorship via DB write** — not preventable at the DB level without a CHECK + trigger; the API enforces it.

## Acceptance Criteria

- [ ] Migration adds `is_founder` and `sponsor_id` columns
- [ ] Admin UI exposes founder toggle + sponsor picker in the user edit modal
- [ ] Sponsor picker excludes self and descendants
- [ ] Save blocked if non-founder with no sponsor
- [ ] Profile page shows "Sponsor: X" or "Founding Father" badge
- [ ] `/loozers` page has Grid | Tree toggle, tree renders as vertical org chart
- [ ] Tree is pan + pinch-zoom on mobile
- [ ] Tree opens centered on the current user's node, with that node highlighted
- [ ] Multiple founders render as separate trees
- [ ] Unsponsored non-founders show in an "Unsponsored" bucket
- [ ] `/spectator/loozers` has the same tree view
- [ ] Tapping a node navigates to that loozer's profile

## Verification Checklist (post-build)

1. Open admin → edit a Loozer → mark as founder → save → reopen, founder toggle still on, sponsor picker hidden
2. Edit a non-founder → pick a sponsor from the dropdown → save → reopen, sponsor field shows correctly
3. Try to save a non-founder with no sponsor → save blocked with inline error
4. Try to set Loozer A as their own sponsor → not in the picker
5. Try to set Loozer A's sponsor to Loozer B, where B was originally sponsored by A → B not in A's picker (descendant filtering)
6. Delete a Loozer with sponsees → backend returns clean error, frontend surfaces it
7. Visit `/loozers/[founderId]` → "Founding Father" badge shows
8. Visit `/loozers/[regularLoozerId]` → "Sponsor: [avatar] X" line shows
9. `/loozers` → toggle to Tree → tree opens centered on your own node, your node visually highlighted
10. Pan/zoom works on phone touch + desktop trackpad
11. Tap a tree node → navigates to that profile
12. `/spectator/loozers` → same tree visible without authentication
13. Mark a Loozer `is_active = false` → still appears in tree, visually dimmed
