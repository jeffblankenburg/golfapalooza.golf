# v1 → v2 Cutover & Data-Migration Plan

**Goal:** make the v2 site (`/new`) the live app and retire v1, with **zero perceived data loss** for users — especially chat, rounds, and courses, which have accumulated real activity while v2 was being built.

**Status of this doc:** plan only. Nothing here has been executed as a cutover step. It reflects the schema as of the research pass on 2026-11-13.

---

## 0. The one fact that makes this easy

v1 and v2 live in the **same Supabase project**, and both identity tables key directly off `auth.users(id)`:

- v1: `public.users.id → auth.users(id)` (`00001_initial_schema.sql`)
- v2: `public.v2_profiles.id → auth.users(id)` (`00179_v2_clean_foundation.sql`)

So **`users.id == auth.users.id == v2_profiles.id`.** Identity mapping is 1:1 and trivial — no phone/email join, no id remap table. Every import migration preserves original row UUIDs, so every foreign key (room→message→reaction, round→player→score, course→tee→hole) maps verbatim.

**Consequence:** this is not a cross-database ETL. It's a set of in-database `INSERT … SELECT … ON CONFLICT (id) DO NOTHING` syncs, almost all of which **already exist and have already run once.** Re-executing them is safe and imports only new rows.

---

## 1. What is already built (and idempotent)

These import migrations were written specifically for this cutover and are re-runnable by primary key:

| Domain | Import migration(s) | Notes |
|---|---|---|
| Profiles (core) | `00186_v2_profiles_from_legacy_users` | id-preserving; enriches NULLs without clobbering |
| Profile extras | `00193_v2_profiles_settings_fields` | occupation, city/state, playing_since, shirt, fun_fact, etc. |
| Directory (sponsor/founder/geo) | `00232_v2_member_directory_import` | also imports accolades |
| Membership | `00188_v2_memberships_from_legacy_users` | enrolls every profile into `slug='golfapalooza'` org; `is_admin→admin` |
| Chat (all 6 tables) | `00195` (schema) + `00196` (import) + `00237` (managed channels) | id-preserving; reply/reaction/receipt/hidden all carried |
| Courses / tees / holes | `00209` (schema) + `00210` (seed) | id-preserving; universal/global library (no org scope) |
| Rounds / players / scores / handicaps | `00224` (schema) + `00225` (import) | id-preserving; personal + global |
| Handicap history table | `00273_v2_player_handicap_history` | new table; v1 audit rows not back-filled (rebuilt forward) |
| Photos / gallery | `00199` | id-preserving; same storage bucket |
| Music / songs | `00201` + `00220` (play history) | — |
| Walk-up entries | `00222` | feature deferred, data landed |
| Articles | `00185` | author relinked in `00186` |
| Ads | `00190` | `fake_ad_loozers` per-user tagging **skipped** |

**Bottom line:** profiles, memberships, chat, courses, rounds, handicaps, photos, music, articles, accolades, and ads are already copied. The cutover re-runs the sync to catch anything added since, then flips the app.

---

## 2. The real risks (what to actually worry about)

### 2a. Delta drift — new rows since the last import
Each import captured v1 **as of when it ran.** Anything created in v1 afterward (new chat messages, new rounds, new courses) is not yet in v2. **Mitigation:** a final re-sync at cutover. Idempotent `ON CONFLICT (id) DO NOTHING` means new ids land and existing ids are skipped — no duplicates.

### 2b. Edit-in-place — the subtle one
`ON CONFLICT (id) DO NOTHING` catches **new** rows but will **not** propagate a v1 *edit* to an already-imported row (the v2 copy wins). This matters for **mutable** domains:
- **Rounds / round_players snapshots / courses / profiles** can be edited in v1. If a user edits an imported round on v1 after the first import, a plain re-sync won't carry that edit.
- **Chat is largely immune** — there is no message-edit endpoint; "delete" is a per-user hide (a new row), and reactions/receipts are additive.

**DECIDED (2026-11-13): freeze v1 writes at cutover AND use `ON CONFLICT (id) DO UPDATE` for the mutable domains (profiles, rounds, round_players, courses, course_tees, course_holes) so the final state is provably v1-authoritative.** v2-side test edits are disposable (no real v2 users yet), so v1 wins outright.

### 2c. Handicap recompute
The index is cached in `v2_player_handicaps` and derived on write via `recalculateHandicap()` (`src/lib/v2/golf/handicap.ts`), driven by `recalcAffectedPlayers()` (`src/lib/v2/golf/recalc.ts`). The import carried both the stored index and the per-player `score_differential` snapshots, so the imported set is self-consistent. **But** any round added/edited after the first import needs a recompute. **Cutover step:** a one-time `recalculateHandicap` sweep over all profiles with completed rounds (cheap, idempotent).
- **DECIDED (2026-11-13): preserve hand-entered handicaps.** v1's `player_handicaps.source` (`'manual'` vs `'computed'`) is dropped in v2 today, so the cutover must **add `source` to `v2_player_handicaps`**, carry it forward in the import, and have the recalc sweep **skip `source='manual'` rows** so admin overrides are never recomputed away.

### 2d. Storage buckets are shared, not re-hosted
Imported `image_url`s (chat images, gallery photos, avatars) still point at the **v1 buckets** (`chat-images`, etc.). Same project → URLs keep resolving. **Do NOT delete v1 buckets after cutover** unless you re-host into v2 buckets first. GIFs are hotlinked Giphy URLs (depend on Giphy's CDN, unchanged).

### 2e. Minor known data drops (accept or address)
- `rounds.weather_conditions` — no v2 column (minor).
- `round_players.is_scorer` — dropped (v2 is co-equal ownership; intentional).
- `handicap_history` audit rows — not back-filled; v2 rebuilds forward.
- A few v2 tee **display names** differ from v1 (`"Red"→"Red 2"`, `"(women)"` stripped) due to v2's stricter `(course_id, tee_name, gender)` uniqueness. Round `tee_id` FKs are unaffected (ids preserved); only name-matching logic would care.

---

## 3. Structural gaps that need a decision (not yet built)

These domains have **no import path** today. They are the substance of the cutover work beyond re-running syncs.

### 3a. Historical events/trips → `v2_events` — COMMITTED (un-deferred)
**DECIDED (2026-11-13): seed the `v2_events` rows as part of cutover (un-deferred so attendance history §3c can land). Build a `trip_id → v2_events.id` crosswalk, seed one `v2_events` row per `trip_year`, and backfill `event_id` on all the NULL children.** The v1 `trip_settings` rows are thin (essentially year/name markers with little real data), so the seed is simple — map `trip_year`/name/status into `v2_events` with sensible defaults. The per-year *browsing UI* is still a separate build item (§8 #7), but all the data lands at cutover.

v1 `trip_settings` (one row per `trip_year`, 28+ years) was never seeded into `v2_events`, so every imported child (chat rooms, articles, accolades, gallery) landed with `event_id = NULL`. Required work:
1. Seed one `v2_events` row per `trip_settings` row (name = year/trip name, dates, `status` mapped), capturing a `trip_id → v2_events.id` crosswalk.
2. Backfill `event_id` on NULL children via the crosswalk: `v2_event_participants` (attendance, §3c), chat rooms (`event_id` + `room_kind='event'`), articles, accolades, gallery.
3. The v2 member UI is hard-bound to a single active event (memory `project_v1_v2_parity_audit`, GH #234). Seeding the data does NOT make past years browsable — that needs the **past-event archive UI** (tracked as a pre-cutover build item, §8).

Keep all `event_id` columns NULL-tolerant regardless, so partial/iterative backfills are safe.

### 3b. Historical contests / winners / financial ledger — DEFERRED
**DECIDED (2026-11-13): accolades (already copied) are the historical record for cutover. Do NOT import old contest rows, payouts, or ledger. Revisit only if users miss historical contest data.**

v2 rebuilt contests, winners, and financials **from scratch** (`00246+`, `00253`); there is **no v1→v2 contest/financial import**, and none is planned for the cutover.

### 3c. RSVP / attendance — MIGRATE (gated on 3a)
**DECIDED (2026-11-13): migrate attendance — it's an important part of the group's history.** `event_participants.on_roster` → `v2_event_participants`, keyed through the `trip_id → v2_events.id` crosswalk from 3a (so 3a's event seeding is a prerequisite, not optional). `event_attendance` is a legacy backup table — skip it; `event_participants.on_roster=true` is the single source of truth.

### 3d. Small profile extras & long-tail domains
| Item | v1 | v2 | Default recommendation |
|---|---|---|---|
| `workbook_name` (historical join key, #114) | `users.workbook_name` | none | Carry forward only if more historical imports will run post-cutover |
| Loozer metrics (8-bag avg, scramble avg) | `users.*` | none | Recompute from imported scores, or copy the two cached numbers |
| Loozer long-form bios | `loozer_bios` | none | Decide — directory imported accolades but not bios |
| Notification preferences | v1 prefs | `v2_notification_prefs` | Decide — carry toggles forward so users don't get re-opted-in |
| Follows / favorites | `user_favorites` | `v2_user_favorites` | Cheap to copy; confirm not already imported |
| Polls + answers | `polls`, `poll_answers` | none | Copy only if poll history must survive |
| Action items | `action_items` | none | Decide |
| Notebook | `notebook` | none | Decide |
| Nominations / Add-a-Rookie | `rookie_nominations` | none | Decide |
| Tee times, rooms/lodging, shirt guide | various | none | **Skip** (ephemeral per-event) unless told otherwise |
| Notifications (delivered history) | `notifications` | `v2_notifications` | **Skip** (transient pushes) |

---

## 4. Cutover runbook (ordered)

Everything in §1 is already applied. This runbook is the **final sync + flip**. Author each sync step as a NEW migration/script (the originals already ran; re-executing their `INSERT … SELECT` bodies is the pattern). Apply via the SQL editor as usual.

1. **Announce + freeze v1 writes.** Put v1 into read-only / maintenance (or accept a short freeze window). This neutralizes edit-in-place drift (§2b). Keep the window short — same DB means the sync is fast.
2. **Re-sync identity first (dependency root):** re-execute the bodies of `00186 → 00193 → 00232 → 00188` (profiles → extras → directory → memberships). Order matters: child tables skip any row whose user isn't yet in `v2_profiles`.
3. **Re-sync content** (FK-safe order within each domain):
   - Chat: `00196` body — rooms → members → messages (reply_to second pass) → reactions → read receipts (UPSERT) → hidden.
   - Courses → tees → holes: `00210` body.
   - Rounds → players → scores → handicaps: `00225` body.
   - Photos `00199`, music `00201`+`00220`, articles `00185`, ads `00190`, walkup `00222`.
   - For **mutable** domains (profiles, rounds, round_players, courses) decide §2b: if using v1-wins, switch those blocks to `ON CONFLICT (id) DO UPDATE SET …`.
4. **Handicap sweep:** run `recalculateHandicap` over every profile with ≥3 completed, individual, 18-hole rounds (or the app's recalc entry point in a one-off script). Preserve `source='manual'` rows if §5 says so.
5. **Long-tail copies** (only the still-open §5 items you opt into): follows, notification prefs, polls, etc. The big structural items (per-year `v2_events` archive, historical contests/financials) are **deferred** — not part of this cutover. Keep `event_id` columns NULL-tolerant so the archive can be built later.
6. **Verify** (§6). Row-count parity per domain; spot-check a few users' chat threads, rounds, and handicaps.
7. **Flip the app** to serve v2 as the primary site.
8. **Post-cutover retention:** keep v1 tables and storage buckets in place (read-only) for a rollback window (see §7). Do **not** delete `chat-images`/gallery/avatar buckets — imported URLs depend on them.

---

## 5. Decisions

**Settled (2026-11-13):**
1. ✅ **Sync posture (§2b):** freeze v1 **and** `DO UPDATE` (v1-wins) for mutable domains.
2. ✅ **Hand-entered handicaps (§2c):** preserve — add `source` to `v2_player_handicaps`, carry it forward, skip recompute for `manual`.
3. ✅ **Historical events (§3a):** seed `v2_events` data now (required by attendance); per-year browsing **UI** deferred to a build item (§8).
4. ✅ **Historical contests / winners / financials (§3b):** accolades-only; no import for cutover.
5. ✅ **RSVP / attendance (§3c):** migrate `event_participants` → `v2_event_participants` (gated on 3a seeding).
7. ✅ **Chat event rooms:** backfill `event_id` + `room_kind='event'` via the 3a crosswalk (now that events are seeded).

**Still open:**
6. **Long-tail (§3d):** confirm skip list (tee times, rooms, shirt guide, delivered notifications) and pick copy/skip for workbook_name, bios, metrics, notification prefs, follows, polls, action items, notebook, nominations.

---

## 6. Verification (per-domain row-count parity)

For each copied domain, compare source vs destination after the final sync, e.g.:

```sql
-- Chat (expect v2 >= v1; v2 may add managed-channel rows)
select (select count(*) from chat_messages) as v1_msgs,
       (select count(*) from v2_chat_messages) as v2_msgs;

-- Rounds / scores / profiles / courses — same pattern per table pair
select (select count(*) from rounds)        as v1_rounds,
       (select count(*) from v2_rounds)      as v2_rounds;
```

Then spot-check: pick 3 active users and confirm their newest chat thread, most recent round + handicap index, and avatar all render in v2. Confirm every org has exactly **one** `all_members` chat room (the promoted "All Loozers", not a duplicate).

---

## 7. Rollback

Because the cutover is additive in the same DB (no destructive writes to v1 tables), rollback is: **flip the app back to v1 routes.** v1 tables, buckets, and data are untouched. Keep them for a defined window (e.g., 2–4 weeks) before considering any teardown. Only after that window, and only if you re-host storage, consider retiring v1 tables/buckets.

---

## 8. Pre-cutover build backlog

Tracked as GitHub **epic [#255](https://github.com/jeffblankenburg/golfapalooza.golf/issues/255)**. This exercise surfaced that the cutover is not purely a data copy — a few things must be **built in v2 first**. Ordered roughly by dependency:

1. **`v2_events` seeding migration** (#247) — crosswalk `trip_id → v2_events.id`, one event per `trip_year`. v1 trips are thin year-markers, so the seed is simple. *Blocks:* attendance, chat/article/accolade/gallery event re-linking. (§3a)
2. **Attendance import migration** (#248) — `event_participants.on_roster` → `v2_event_participants` via the crosswalk. (§3c)
3. **Historical `event_id` backfill** (#249) — set `event_id` on chat rooms (`+ room_kind='event'`), articles, accolades, gallery from the crosswalk. (§3a)
4. **`v2_player_handicaps.source` column + import + recalc guard** (#250) — preserve `manual` overrides, skip them in the recalc sweep. (§2c)
5. **Final cutover sync migration(s)** (#251) — the re-executable `INSERT … SELECT` bodies, with `DO UPDATE` (v1-wins) on the mutable domains and `DO NOTHING` elsewhere. (§4)
6. **Handicap recalc sweep** (#252) — one-off script over all profiles with ≥3 completed individual 18-hole rounds, skipping `manual`. (§4.4)
7. **Past-event archive UI** (#253) *(the big one)* — the v2 member app is hard-bound to a single active event (GH #234), so seeded history isn't *visible* without a past-events browse surface. Seeding the data (items 1–3) prevents loss; this item is what lets users actually see 28 years of events/attendance/accolades per year. Prioritize relative to "feeling like nothing was lost."
8. **Long-tail copies** (#254) — pending §6 decisions (follows, notification prefs, polls, etc.). Any domain with NO v2 feature (polls, action items, notebook, nominations) also needs the *feature* built if its history must be usable, not just stored.

Items 1–6 are migration/script work. Item 7 (and any item-8 features) is product work — likely the real gating factor on "when can we switch."

---

## Appendix — key files

- Identity: `00001`, `00179`, `00186`, `00188`, `00193`, `00232`
- Chat: `00008`, `00042`, `00083`, `00150`, `00195`, `00196`, `00197`, `00237`; `src/lib/v2/chat/channels.ts`
- Rounds/courses/handicap: `00002`, `00209`, `00210`, `00224`, `00225`, `00226`, `00230`, `00240`, `00273`; `src/lib/v2/golf/{handicap,recalc,calculator}.ts`
- Other content: `00185` (articles), `00190` (ads), `00199` (gallery), `00201`/`00220` (music), `00222` (walkup)
- Parity (feature, not data): `docs/issues/v1-v2-parity-gaps.md`, GitHub #234
