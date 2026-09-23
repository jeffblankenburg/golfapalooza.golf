Standing tracker for v1 → v2 **admin tooling** parity. Source of truth for what
admin surfaces still need porting. Derived from a full diff of `(admin)/admin/*`
(+ `api/admin/*`) against `new/[slug]/admin/*` (+ `api/v2/*`) and the `v2_` schema.

Legend: ✅ at parity · 🟡 partial · ❌ no v2 model yet ("no v2 model" = neither
tables nor routes exist). Cross-linked to the domain epics.

## ✅ At parity
- [x] Announcements — authoring, audiences (everyone/event/custom), scheduled cron
- [x] Articles — rich-text editor, inline media, resize, author picker, pin, notify, views (#195, #164)
- [x] Music — admin management
- [x] Members / Users — directory, roles, archive/inactive
- [x] Courses — create/edit (Loozer-editable) + admin lock toggle (#194)

## 🟡 Partial
- [ ] **Attendance** — v2 has event roster + RSVP; missing v1's full attendance **grid** (bulk cell editing, contest auto-enroll sync). Epic #176
- [ ] **Gallery moderation** — inline admin delete exists; no dedicated moderation / reprocess page. Epic #172
- [ ] **Course import review** — no admin "unverified queue" for AI/GCAPI imports (v1: `/admin/courses/unverified`)
- [ ] **Accolades** — `v2_accolades` table + member display exist, but no admin authoring UI. Epic #173
- [ ] **Ads / Spirit Wear** — `v2_ads` renders on home; no admin CRUD

## ❌ No parity — whole domains missing in v2

### Scores & Games — event competitions (epic #170, event admin #176)
- [ ] Contests spine (buy-ins, parent/child, payout splits)
- [ ] Calcutta (auction, bids, ownership, prizes)
- [ ] Scrambles (teams, hole scores, bonuses, handicaps) + Scramble Skins
- [ ] Skins
- [ ] Cornhole (bracket, advance, members)
- [ ] Pick'em (settings, payments, results, payouts)
- [ ] KGB Cup (handicaps, pair calc, live scores)
- [ ] Ryder Cup (pairs, batch, reset)
- [ ] CTP / Long Drive (hundred-feet)
- [ ] Contest winners + paid status
- [ ] Handicaps admin (contest tees, composition tees)

### Financials (epic #170 / #176)
- [ ] Cost items catalog + trip cost derivation
- [ ] Balances (who owes what)
- [ ] Ledger / transactions / transaction history
- [ ] Payout events + payout grid
- [ ] Denominations (bill mix)
- [ ] Winners ledger + impact

### Schedule & Logistics (epic #171)
- [ ] Tee times / tee sheet (counts, players, publish)
- [ ] Itinerary
- [ ] Rooms / facilities / lodging assignments
- [ ] Shirt Guide (daily shirts + images)

### Stories & Recognition (epic #173)
- [ ] Nominations
- [ ] Member bios admin
- [ ] Notebook / BSPITW
- [ ] Accolades admin authoring (see 🟡 above)

### Other
- [ ] Polls (no v2 table/API at all)
- [ ] Admin analytics dashboard
- [ ] Fake ads admin CRUD (`v2_ads` exists; no editor)

## Intentionally NOT ported
- History / workbook import (`api/admin/history/*`) — v1-only; the multi-tenant
  platform has no legacy Golfapalooza workbook.
- Simulator (v1 user impersonation) — v2 uses its own model; revisit if needed.

## v2-only (no v1 equivalent — multi-tenant platform)
Org settings, per-org/per-event feature flags, invites, custom domains,
branding/logo, follows. Not parity items; listed for completeness.

Part of the v2 platform build (#177). Group admin tooling epic: #175.
