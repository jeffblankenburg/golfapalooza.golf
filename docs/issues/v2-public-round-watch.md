## Summary
A **public, unauthenticated spectator page** for a single round — the golfer shares
a link and anyone (no login, no membership) can watch that round's scorecard, live.
This is the **first public (no-auth) surface in v2** (the same gap that deferred
spectator articles in #195).

## Infra notes (verified)
- **Auth boundary:** the `(event)` layout redirects unauthenticated visitors; the
  `[slug]` layout renders plain children for non-members. So a page at
  **`/new/[slug]/rounds/[id]/watch`** (sibling of the authed group) renders for anon
  with no redirect.
- **Anon can't read rounds directly:** `v2_rounds` / `v2_round_scores` RLS is
  `TO authenticated` only (no `anon` grant). So a public page must get its data from
  a **server API using the admin client**, NOT the anon client. Client-side anon
  realtime is out unless we open RLS to `anon` globally (rejected — would expose
  every round to anyone).

## Design
- **Public page** `/new/[slug]/rounds/[id]/watch`:
  - Read-only scorecard: all players (guests included), per-hole scores, par row,
    totals + to-par, course + tee + date, org branding, a **LIVE** badge while
    in progress. Names honor the org name mode.
  - No comments, no manage actions, no handicap internals, no "You" highlight
    (spectator isn't a player).
- **Public API** `GET /api/v2/rounds/[id]/public` — no auth, admin client, returns
  the read-only scorecard shape (reuse the card/detail data builder).
- **Live updates via polling:** the page polls the public API (~12s) while
  `status = in_progress`; stops once completed. Safe, no RLS change. (Anon realtime
  would require granting `anon` SELECT on the round tables — not doing that.)
- **Share action:** "Copy watch link" / share the URL — on the round detail and the
  live scorer. Complements the PNG share (#204): PNG = snapshot, watch link = live.

## Decisions
1. **Access:** public by **UUID link** (unguessable, no expiration) — matches the PNG
   card's light-security stance. (Alternative considered: a per-round "make
   shareable" toggle; deferred unless wanted.)
2. **Live:** **polling** the public API, not anon realtime.
3. **Expiration:** none.

## Open / build-time
- Exact share entry points (round detail, live scorer, both).
- Whether to show anything beyond the scorecard (e.g., a small "watching live"
  count) — probably not for v1.
- Reuse vs fork the scorecard rendering component between the drawer detail and the
  public page.

## Acceptance
- Opening `/new/[slug]/rounds/[id]/watch` **logged out** shows the round's scorecard
  (all players), updates live while the round is in progress, and shows final scores
  when complete — with no login prompt.
- A share/copy-link control produces that URL.
- No round data is exposed to the `anon` DB role (all public reads go through the
  server admin client).

Part of the My Rounds epic (#174). Establishes the public-surface pattern that
spectator articles (#195) can later reuse.
