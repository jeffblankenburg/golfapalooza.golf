# 3s and Ds (v2)

A live event-caller + entertaining big-screen board for the "3's and D's" basketball wager, run at an event or group gathering. **The app does not track pairs, wagers, or money** — a room full of pairs settle their own cash on the spot. The app provides two things: (1) a **scorer console** to log team-attributed events, and (2) a **full-screen board** tied to a live ESPN game that reacts with animations, GIFs, and sounds, showing a running unit differential, streaks, and the live score.

## Locked decisions

| Decision | Choice |
| --- | --- |
| Activity, not a buy-in contest | No entry fee, no pot, no enrollment, no ledger. Reuses the contest spine as a no-fee manual activity for its admin + board routes. |
| Scope | Event- **or** group-level (`event_id` nullable), like other contests. |
| Real game | Picked from **today's ESPN slate** (NBA + NCAA men's) → gives teams/logos/colors **and a live score** on the board. |
| Scoring | **Manual** (ESPN can't see airballs/missed dunks). A designated scorer runs event entry. |
| Units, not dollars | Every pair stakes their own X, so the board counts in **units** ("DUKE +4"); each pair multiplies by their own stake. |
| Entertainment | Per-event **reaction** = animation + Giphy GIF(s) + sound. Sound can be a **Soundboard** clip. Fires on every money-moving event (wins and owes). |

## Event set (rule values fixed; labels/reactions editable)

Win (executing team collects):
- **3-point play** — 1X (a made 3, or a basket + the and-1)
- **Dunk** — 1X
- **4-point play** — 2X
- **Half-court shot** — 3X
- **Buzzer-beater** — 3X

Owe (executing team pays):
- **Airball (backcourt 3)** — 1X
- **Airball (frontcourt 3)** — 2X
- **Missed dunk** — 2X

Each event is attributed to Team A or Team B. Unit swing toward A = `team==a ? (win? +pts : -pts) : (win? -pts : +pts)`. The board sums swings for the differential; a streak = consecutive swings favoring the same side.

## Data model

- **`v2_contests`** — `contest_type: '3s_and_ds'`, `scoring_source: 'manual'`, no fee/payouts. `config = { reactions: {...} }` (per-event animation/GIF/sound).
- **`v2_matchups`** (reused) — one row = the current ESPN game: `competitor_a`/`competitor_b` (name, abbrev, logo, color, espn_id), `external_ref` (espn_event_id, league), `status`, `result`. Team A = ESPN **away**, Team B = **home**.
- **`v2_3s_events`** (new) —
  ```
  id          uuid pk
  contest_id  uuid not null -> v2_contests(id) on delete cascade
  matchup_id  uuid not null -> v2_matchups(id) on delete cascade
  team        text check (team in ('a','b'))
  event_type  text        -- 'three_point_play' | 'dunk' | 'four_point_play' | 'half_court'
                          --  | 'buzzer_beater' | 'airball_backcourt' | 'airball_frontcourt' | 'missed_dunk'
  points      smallint    -- positive multiplier (1,2,3)
  result      text check (result in ('win','owe'))
  created_by  uuid -> v2_profiles(id)
  created_at  timestamptz
  ```
  Realtime-enabled (REPLICA IDENTITY FULL + publication). **Undo = delete the latest row.**

## ESPN reuse (no client changes needed)

- List today's games: `GET /api/v2/sports/games?league={nba|mens-college-basketball}&date=YYYYMMDD` → `fetchScoreboard` (`src/lib/v2/sports/espn.ts`).
- Live score: `fetchGameScore(league, espnEventId)` → `{ away/home.current, detail (clock/period) }`, called on the board (server render + slow poll).
- Store the chosen game: a small `set3sGame(contestId, espnGame)` that upserts the single `v2_matchups` row (mirrors `addEspnGames`'s competitor JSON), + `refresh3sScore` using `fetchGameScore`.

## Surfaces

- **Admin** (`/admin/contests/[id]`): create the activity; **pick the game** from today's slate (league + date → list → choose); edit **reactions** (animation/GIF/sound per event).
- **Scorer console** (`/admin/contests/[id]/live`): a Team A/B toggle + the 8 event buttons + **undo last**. Logs to `v2_3s_events`. Mirrors `AuctionRecorder` (realtime + 5s poll).
- **Big board** (`/admin/contests/[id]/board`): full-screen, chrome-less (`fixed inset-0`, `z-70`), mirrors `AuctionBoard` projector. Shows team logos/colors, the **live ESPN score + clock**, the **unit differential**, a **streak** callout, an **event feed**, and the **reaction overlay** (animation + GIF + sound) on each new event. Realtime (`v2_3s_events` + `v2_matchups`) + 4s poll.

## Reactions (entertainment layer)

Per event type: `{ animation: <style key>, gifs: string[], soundUrl: string | null }`.
- **Animation** — a small built-in set applied on the board: `slam`, `confetti`, `shake`, `zoom`, `groan`.
- **GIF** — picked via the existing Giphy integration (`NEXT_PUBLIC_GIPHY_API_KEY`, the chat GIF picker). Multiple per event → randomized so it stays fresh.
- **Sound** — reuses the **Soundboard** Web-Audio engine; `soundUrl` can be a Soundboard clip's public URL or an upload; a bundled **cash-register** default ships in `/public`.
- Fun defaults seeded on create; admin edits anytime.

## Build phases

1. **Schema + contest-type wiring** — migration (enum `+'3s_and_ds'`, `v2_3s_events` + realtime), `CONTEST_TYPES`/labels/scoring-source, `create3sAndDs` server fn + API create handler, `GroupContestsAdmin` ADDABLE entry, feature-catalog entry, seeded reaction defaults.
2. **Admin game picker + reactions editor** — ESPN slate picker (league + date), `set3sGame`/`clear`, the reaction config UI (animation + Giphy + sound, sound choosable from Soundboard).
3. **Scorer console** — team toggle + 8 event buttons + undo + log/undo API.
4. **Big board** — full-screen: teams, live ESPN score, differential, streak, feed, reaction overlay (animation + GIF + sound), realtime + poll.
5. **Polish** — bundle cash-register asset, animation CSS, README + v2 design-guide, verification checklist.

## Edge cases

1. **Undo** removes the last event (its reaction won't replay).
2. **New game** — picking a different ESPN game clears events and swaps teams.
3. **Live score ≠ wager units** — the ESPN score is independent of the manual event tally; both shown, clearly separated.
4. **No money anywhere** — the room settles cash; nothing posts to My Money.
5. **Access** — admin or a granted operator runs the scorer; the board is view-only and opened/shared by the admin (new tab, like the auction board).
6. **Spectator** — N/A (admin/board tool), not on `/spectator`.
7. **Simulator** — events logged under the effective user.
8. **No game picked yet** — board shows a "waiting for a game" state; scorer console disabled until a game is set.

## Acceptance criteria

- [ ] Admin creates a 3s-and-Ds activity (event or group) and picks a game from today's NBA/NCAA men's slate; the board shows both teams + the live ESPN score.
- [ ] Scorer taps a team + an event; the board instantly plays the reaction (animation + GIF + sound) and updates the unit differential + feed + streak.
- [ ] Undo removes the last event and its effect.
- [ ] New game swaps teams and resets events.
- [ ] Reactions are editable per event (animation/GIF/sound); sounds are selectable from the Soundboard.
- [ ] The board auto-updates the ESPN score live and never goes stale (realtime + poll).
