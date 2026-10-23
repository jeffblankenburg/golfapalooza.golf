# v1 → v2 parity gaps (tracking)

v1 is being fully retired, so every capability v1 has that v2 lacks must be carried forward or deliberately retired on the record. This issue is the running inventory from the Oct 2026 parity audit (7 feature areas + admin). Each item notes where it'd live in v2.

Legend: ✅ at/above parity · ⚠️ partial · ❌ missing/not ported.

---

## Tier 1 — Shipped in v2 but inert/broken (fix first)

- [ ] **Follow-a-member notifications never fire.** `v2_user_favorites` saves the three toggles and the UI renders them, but no producer emits them. Port `src/lib/favorites/fanout.ts` → wire into `POST /api/v2/rounds` (started / quick-completed), `POST /api/v2/rounds/[id]/scores` (hole-by-hole, first-score transitions only), `POST /api/v2/rounds/[id]/complete` (finished). Honor per-follow toggle + global mute + self-suppression; deep-link to the v2 watch page.
- [ ] **Announcements & Birthdays pages built but unreachable.** `(event)/announcements` and `(event)/birthdays` exist but aren't in `src/lib/v2/features.ts`, so they never appear in nav/Everything. Add catalog + `FEATURE_ROUTES` entries.
- [ ] **Handicap history not logged.** `src/lib/v2/golf/handicap.ts:10` skips the audit table v1 wrote on each recalc. Add a `v2_player_handicap_history` table + insert in the recalc pipeline.

## Tier 2 — Built feature, missing v1 affordances

### Rounds / Scoring / Handicap / Courses
- [ ] Dedicated **scramble scorer** (single team row) — v2 renders per-player entry for `format='scramble'`.
- [ ] **Edit a completed round** (no v2 analog to `/rounds/[id]/edit` + `RoundEditor`).
- [ ] **Add/remove players after creation** (no `/api/v2/rounds/[id]/players` endpoint or UI).
- [ ] **Full Scorecard** dense entry mode for logging a past round.
- [ ] **Composition-tee per-hole resolution** in the live scorer (`score/page.tsx:42` TODO).
- [ ] Score-description text labels (Eagle/Birdie/…) per player in the live scorer.
- [ ] Active-event course featured on top of the course library.
- [ ] Minor: women's-tee sub-tabs in RoundForm; Live-mode ≤4 gate; "Edited" indicator.

### Contests
- [ ] **No member-facing scramble** experience at all (`contests/[contestId]/page.tsx:50` notFound()s scramble) — no live scores, leaderboard, or scorecards; no realtime; no close/verify lifecycle.
- [ ] **BSPITW** and **100 Feet** are stubs (createable, no scorer/display).
- [ ] Skins: cross-day aggregation + auto payout $ (counts only today).
- [ ] 🎯 daily-game hole badge in scoring; "Daily Games by day" member page.
- [ ] Pick'em deadline/urgency "MAKE PICKS" notification.

### Chat / Gallery / Music
- [ ] Walk-Up Player: tee-group sectioning, per-player detail (handicap/years/hometown), scrubber "set start to here". (Depends on v2 tee-time/scramble-team data existing.)
- Chat & Gallery: ✅ full parity (chat adds reply-to + deep-link-to-message).

### Articles / Announcements / Schedule / Birthdays / Home
- [ ] Schedule TZ-abbreviation badge; birthday "today" in event timezone.
- [ ] "Up Next" schedule card on home.
- (Articles/Announcements/core Schedule authoring: ✅ at/above parity.)

### Financials / Options / Balances / RSVP
- [ ] **Edit a ledger transaction** (`transactions/route.ts` is POST+DELETE only).
- [ ] **Trip-wide Winners payout grid** (Loozer × contest, mark-paid). `lib/payout-events/grid-v2.ts` already written, wired only to v1.
- [ ] **Payout Denominations planner** + **Payout Events config** (needs a v2 data source).
- [ ] Transaction history filtering (search/date/source); lifetime/cross-event balance + scope toggle.
- [ ] Member-facing "Pay now" Venmo link on the balance page (deferred settle-up, #221).
- [ ] Minor: "G Credit" tender; transaction attribution/edit-history.
- (RSVP/enrollment: ✅ at/above parity, incl. new admin roster-break alerts.)

### Admin
- [ ] **Smart-visibility auto time-gating** (v1 `src/lib/visibility.ts` derived from the trip timeline; v2 is manual windows only).
- [ ] **Handicap admin**: event lock/snapshot/compare + individual override.
- [ ] **Admin analytics dashboard** (`/admin/analytics` + dev-analytics).
- [ ] **Duplicate / clone event** (v1 #85).
- [ ] **Admin attendance roster manager** (stubbed tile, no page; lib helpers exist).
- [ ] Event Days manager, event timezone, event→course / event→facility linking.
- [ ] Per-member admin tabs (scorecards/stats/songs); Bios admin.

## Tier 3 — Whole v1 features not ported yet (mostly catalogued `planned`)

- [ ] **KGB Cup / Ryder Cup** (largest — no schema/API/UI).
- [ ] **Calcutta**, **Cornhole**, **Boland Bet**, **100 Feet**, **BSPITW**.
- [ ] **Polls**, **Shirt Guide**, **Nominations / Add a Rookie**, **Fake Ads**, **Notebook**, **Rooms / Lodging**, **Accolades / Awards**, **Tee Times**, **Action Items**.
- [ ] **Tee Times** cascade: no home tee-time card, no schedule integration, no reminder cron.
- [ ] **Birthday chat auto-post** (home banner ported; daily system-bot chat message not).

## Cross-cutting initiatives (from follow-up product questions)

- [ ] **Past-event access for members.** The member UI is hard-bound to the single `status='active'` event; archived events are unreachable. Build a member Events/archive index + per-event member route (eventId from URL) + event switcher. Access is org-membership-based (not participation-gated), so non-participants can view — which is desired. No RLS changes needed.
- [ ] **Member Contests index** ("Everything → Contests"): list active + concluded member-visible contests; relax the `status='active'`-only gate to include `final` (read-only). Rides on past-event access for contests tied to archived events. Decide whether "visible to members" = `final` or a new `member_visible` flag.

## Deliberate redesigns (NOT gaps — recorded so they aren't re-flagged)

- Live Now / Recent Rounds folded into the unified Activity feed.
- Money charges derived live (Trip Cost + options) instead of stored ledger rows.
- Option open/close moved into the Features scheduling window.
- Quick-links grid replaced by admin-pinned bottom nav + "Everything" launcher.
