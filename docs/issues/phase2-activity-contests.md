Phase 2 of #208. Turns an `kind='activity'` schedule item into a real, configurable module. First target: **scramble + its side contests** (skins, closest-to-pin, long drive, long putt). Ports v1's proven **contests-as-spine** model (`contests` + `parent_contest_id` + `scramble_*` sub-tables + `contest_winners`) into the `v2_`-prefixed, org/event-scoped world.

## Mental model (decided)

Two distinct concepts, deliberately separated:

- **Activity** — *how you play*. The scramble is a format: teams, one ball, a gross/net team score per hole. It produces the **scorecard** and owns tee times + rosters. It's what shows on the schedule.
- **Contests** — *what you can win*. Skins, CTP-front, CTP-back, long drive, long putt: each a competition with its own entry, pot, payout, opt-in, and winner(s). Several hang off one activity.

The side games are **not** one blob with the scramble, and **not** standalone activities — they're **child contests scoped to the scramble** (`parent_contest_id → the scramble`). The scramble is itself a contest too (the team competition/payout that reads the team scores).

Contests split by **scoring source**:
- **`derived`** — computed from the activity's scorecard: **skins** (reads team hole scores), the **scramble's own** net/gross result.
- **`manual`** — adjudicated by a human on scoped holes: **CTP**, **long drive**, **long putt** (a measurement/winner, independent of stroke scores).

## Admin UX (decided)

One schedule entry ("Scramble"). Opening it **is** the module: Teams · Handicaps · Payout, plus a **Side games** section where you add Skins / CTP / LD / Putt (each scoped to its hole(s)). Side games do **not** get their own schedule rows — they ride the scramble's round/tee times. `schedule_items.activity_id → v2_contests.id` (the top-level scramble); children link via `parent_contest_id`.

---

## Schema

All tables: permissive RLS + API-layer admin gating (mirrors `v2_schedule_items` / `v2_round_games`); `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated, service_role`. Org multi-tenant; simulator-aware writes (`getEffectiveUserId`). Naive-local times like the rest of the schedule.

### `v2_contests` — the spine
```
id                  UUID PK
org_id              UUID NOT NULL  → v2_organizations ON DELETE CASCADE
event_id            UUID NOT NULL  → v2_events        ON DELETE CASCADE
parent_contest_id   UUID           → v2_contests(id)  ON DELETE CASCADE   -- side game → its scramble
contest_type        TEXT NOT NULL CHECK IN
                      ('scramble','skins','ctp','long_drive','long_putt',
                       'ryder_cup','calcutta','cornhole','pickem','other')
name                TEXT NOT NULL
scoring_source      TEXT NOT NULL CHECK IN ('derived','manual')          -- how a winner is decided
holes               SMALLINT[]     -- scope; NULL = all 18; {1..9}=front; {12}=a single hole
config              JSONB          -- per-type: {team_size, handicap_allowance, skins_carryover, ...}
entry_amount_cents  INTEGER        -- simple buy-in for now (full cost_items integration is later)
payout_splits       JSONB          -- how the pot carves up (port PayoutSplit shape)
auto_enroll         BOOLEAN NOT NULL DEFAULT false  -- scramble/ryder/calcutta true; skins = paid opt-in
declared_no_winner  BOOLEAN NOT NULL DEFAULT false  -- CTP/LD "explicitly nobody won"
status              TEXT NOT NULL DEFAULT 'draft' CHECK IN ('draft','active','final')
winners_locked_at   TIMESTAMPTZ
winners_locked_by   UUID → v2_profiles ON DELETE SET NULL
sort_order          INTEGER NOT NULL DEFAULT 0
created_by          UUID → v2_profiles ON DELETE SET NULL
created_at, updated_at TIMESTAMPTZ
CHECK (parent_contest_id IS NULL OR parent_contest_id <> id)   -- one-step cycle guard (deeper: app)
```
Indexes: `(event_id)`, `(parent_contest_id) WHERE NOT NULL`, `(org_id)`.

### `v2_contest_participants` — who's in
```
id, contest_id → v2_contests ON DELETE CASCADE,
user_id → v2_profiles ON DELETE CASCADE,
created_at,
UNIQUE(contest_id, user_id)
```
Plus (defer to 2b) **`v2_contest_enrollment_exclusions`** — tombstone of "opted out; don't auto-re-add" (mirrors v1), so auto-enroll from the event roster doesn't fight a manual removal.

### `v2_scramble_teams` — the format's teams
```
id, contest_id → v2_contests ON DELETE CASCADE,
name            TEXT,
team_handicap   NUMERIC,
course_par      INTEGER NOT NULL DEFAULT 72,
tee_time        TIME,           -- projected into the merged schedule (see 2c)
starting_hole   SMALLINT,       -- shotgun support
created_at, updated_at
```

### `v2_scramble_team_members`
```
id, team_id → v2_scramble_teams ON DELETE CASCADE,
user_id → v2_profiles ON DELETE CASCADE,
UNIQUE(team_id, user_id)
```

### `v2_scramble_hole_scores` — one team score per hole
```
id, team_id → v2_scramble_teams ON DELETE CASCADE,
hole_number SMALLINT CHECK 1..18,
strokes     SMALLINT CHECK 1..20,
UNIQUE(team_id, hole_number)
```
Skins (`derived`) reads directly from this table.

### `v2_contest_winners` — single source of truth for who won + paid
```
id, contest_id → v2_contests ON DELETE CASCADE,
user_id     UUID → v2_profiles       ON DELETE CASCADE,   -- individual contests
team_id     UUID → v2_scramble_teams ON DELETE CASCADE,   -- team contests (scramble, team skins)
hole_number SMALLINT,                                     -- per-hole wins (skins, CTP)
place       SMALLINT NOT NULL DEFAULT 1,
amount_cents INTEGER,                                     -- payout to this winner
paid        BOOLEAN NOT NULL DEFAULT false,
paid_at     TIMESTAMPTZ,
notes       TEXT,
resolved_at TIMESTAMPTZ, resolved_by UUID → v2_profiles ON DELETE SET NULL,
CHECK (user_id IS NOT NULL OR team_id IS NOT NULL)
```
- **Skins:** one row per won hole (`team_id` + `hole_number`).
- **CTP/LD/LP:** one row (`user_id` or `team_id` + `hole_number`), or `declared_no_winner` on the contest if nobody got it.
- **Scramble overall:** place-based rows (`team_id` + `place`).

### Schedule linkage
`v2_schedule_items.activity_id` already exists (nullable UUID). It points at the top-level contest (the scramble). No new column needed; when the module is created from a schedule item we set `activity_id`, and the composer marks that entry `source:"activity"`.

---

## Merged-feed integration (the composer hook)

`buildMemberSchedule` already has a stubbed activity-provider slot. In 2c it will, for each active event's activity contests, emit **tee-time entries** from `v2_scramble_teams.tee_time` as `source:"activity"` `CalendarEntry`s that deep-link into the module (e.g. "Group 3 tee off, 8:24am"). This is what finally closes the v1 parity gap "tee-times woven into the day view."

---

## Build sub-phases

- **2a — Schema + scramble core.** Migration for the tables above. Admin: create a scramble on a schedule item, build teams (2-man/4-man…), set handicaps, enter/track team hole scores (reuse the v2 scoring pipeline where possible). Member: read-only scramble standings.
- **2b — Side contests.** Add Skins (derived from team scores, carryover option), CTP-front/back, Long Drive, Long Putt (manual winner + `declared_no_winner`) inside the scramble module. Winner recording → `v2_contest_winners`. Participant opt-in + exclusions tombstone.
- **2c — Tee times + feed projection.** Tee times on teams; implement the composer's activity provider so tee times surface on the merged schedule.
- **2d — Member results.** Standings/results views for scramble + side games; deep links from the schedule.
- **2e — Payouts (depends on a v2 financial system).** `entry_amount_cents`/`payout_splits` are placeholders now; full cost-catalog + denominations integration is a separate epic (v1's `cost_items` / payout-events aren't ported to v2 yet).

## Later modules (each its own issue, same attach-via-`activity_id` + `parent_contest_id` pattern)
Calcutta auction · Cornhole bracket · Ryder Cup (team match play) · Skins/Pick'em as standalone. Also: named event days and pre-event grouping (remaining v1 parity gaps).

## Open questions
- **Auto-enroll source:** mirror v1's `syncAttendanceEnrollment` (event roster → scramble participants, additive, guarded removal). Confirm the v2 roster source (`event_participants.on_roster` equivalent).
- **Guests/non-members** on scramble teams (v1 `round_players` guest model) — needed for v2 contests, or Loozers-only for now?
- **Season/group-level contests** (non-event pools, v1 `financial_contests`) — out of scope here; note for later.
