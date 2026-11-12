## Overview

A new v2 contest type: **Props** — an admin authors a set of proposition questions for any event ("How long will the national anthem be?", "How many aircraft in the flyover?", "Which team wins the coin toss?", "Over/under 48.5 total points"), members submit one answer per question before a single lock time, and the admin enters the correct answer for each question manually after the event. Points are scored, a leaderboard ranks everyone, and (optionally) a pot pays out via the shared options/balances money engine.

This is deliberately **manual-settlement-first**. The fun props (anthem length, flyover count, Gatorade color, halftime song count) have **no reliable programmatic data source** — they're priced and settled by sportsbooks/media, not any API. Manual entry isn't a compromise; it's what makes this contest universal: it works for the Super Bowl, the Oscars, election night, or a group trip, not just events we have a stats feed for.

Architecturally it's a **generalized Pick'em**. Pick'em is already "a slate of binary ATS picks + one numeric tiebreaker, with a leaderboard and options/balances money." Props is the same skeleton with heterogeneous question types and manual settlement. Reuse the Pick'em implementation end-to-end (schema shape, authoring UI, member/leaderboard UI, realtime, money).

## Locked design decisions

1. **Numeric scoring rule is admin-chosen.** A contest-level default, with an optional per-question override.
2. **One lock for the whole set.** The admin must set a required lock date/time; after it passes, answers are read-only.
3. **Any question can be voided at any time.** A voided question is dropped from scoring for everyone (and from the max-points total).
4. **Admin-authored, members answer.** No member-proposed props in v1.
5. **Fully manual settlement in v1.** ESPN auto-fill for game-stat props is a future enhancement, explicitly out of scope here.

## Question types

- **`multiple_choice`** — admin defines 2+ named choices; member picks one; correct = one choice. ("Coin toss: Heads / Tails", "Gatorade color".)
- **`yes_no`** — multiple-choice sugar (Yes / No).
- **`numeric`** — member types a number; correct = a number; scored by the numeric rule. ("Anthem length in seconds", "aircraft in the flyover".) Optional display `format` hint: plain number vs. duration (mm:ss) — store the raw number either way.
- **`over_under`** — admin sets a `line` (e.g. 48.5) and a subject; member picks **Over** or **Under**; at settlement the admin enters the actual value and the winning side is derived. Actual exactly equal to the line → **push** → the question auto-voids.

Each question also has: a **prompt**, a **point value / weight** (default 1), `sort_order`, and a nullable `numeric_rule` override.

## Numeric scoring rules (admin-selectable, per-set default + per-question override)

- **`absolute`** (default) — smallest `|guess − actual|` wins the question's points. Ties = co-winners, each gets full points.
- **`no_over`** — "Price Is Right": closest without going over; guesses above the actual are disqualified for that question. If everyone went over, nobody scores it.
- **`exact`** — only an exact match scores.

Leaderboard ties (equal total points) are resolved by **splitting place payouts** via the existing shared engine — points themselves are never fractionalized.

## UX flow

**Admin (authoring — mirrors `PickemAdmin`)**
- Create the Props contest (group-scoped or event-scoped, like Pick'em/Auction; `event_id` nullable).
- Set the single **lock date/time** (required) and the **default numeric rule**.
- Add/edit/reorder questions: prompt, type, choices (MC), line + subject (O/U), points, optional per-question numeric-rule override.
- Configure **payout splits** (shared `PayoutSplitsEditor` + `payout_splits`).
- After the event: **Enter results** — per question, enter the correct choice / number / actual value, or **Void** it. Scoring recomputes live. For numeric questions, show the winning guess(es).

**Member (answer + leaderboard — mirrors `PickemContent`)**
- One card per question: MC/YN = choice buttons; numeric = number input; O/U = Over/Under buttons showing the line.
- One answer per member per question, editable until the lock, then read-only. Auto-save (no Save button).
- Leaderboard tab: total points, sorted, viewer highlighted, provisional standings as the admin enters answers; expand a row to see their answers vs. the correct ones. Pot + prize structure + "you're on track to win $X" line when there's money (same treatment as Pick'em).

## Technical plan

Mirror the Pick'em stack.

1. **Migration(s)** — `contest_type = 'props'`; two child tables with Data API grants:
   - `v2_prop_questions` (`id`, `contest_id`, `org_id`, `sort_order`, `prompt`, `qtype`, `choices jsonb` for MC, `line numeric` + `ou_subject text` for O/U, `points int default 1`, `numeric_rule text null` override, `answer_text text null` (MC choice / O/U winning side), `answer_number numeric null` (numeric guess target / O/U actual), `voided boolean default false`, timestamps).
   - `v2_prop_answers` (`id`, `question_id`, `contest_id`, `user_id`, `choice text null`, `number numeric null`, timestamps, `UNIQUE(question_id, user_id)`). A CHECK that the populated column matches the question type is a stretch (type lives on the parent); enforce in the API instead.
   - Contest config JSON holds `locks_at` (timestamptz) and `numeric_rule` (set default).
   - Grants: `GRANT SELECT, INSERT, UPDATE, DELETE ON <tables> TO authenticated, service_role;` (member-only; no `anon` — Props, like Pick'em, is excluded from the spectator page).
   - Publish both tables (+ `REPLICA IDENTITY FULL`) to `supabase_realtime` for the live leaderboard; `v2_contests` is already published. Pattern: `00288_v2_contest_participants_realtime.sql`.

2. **Pure logic** — `src/lib/v2/contests/props.ts`: scoring per type + numeric rule, void handling, leaderboard computation, max-points. Model on `pickem.ts`.

3. **Server wiring** — `src/lib/v2/contests/props-server.ts`: `loadPropsBoard` (questions + my answers + leaderboard + lock state + pot/placePayouts), submit/settle/void mutations, and `loadPropsPayouts` (mirror `loadPickemPayouts` / `loadAuctionPayouts`). Money reuses options/balances + `computePlacePayouts`; entry fee bundled as an Option; winners paid via the ledger (`source='winnings'`). No bespoke money table.

4. **API** — `src/app/api/v2/orgs/[id]/contests/[contestId]/props/...`: member answer POST; admin question CRUD + reorder; admin settle (enter correct answer) + void; payout settle. Admin routes gated by `isOrgAdmin`.

5. **Realtime** — `src/lib/v2/realtime/props-channel.ts` (`subscribeToProps`) on the two tables + `v2_contests`; member screen + home card `router.refresh()` on change.

6. **UI** — `PropsAdmin` (authoring + settlement), `PropsContent` (member answer + leaderboard), `PropsHomeCards` + extend `HomeCardsLive` with a `"props"` type. Add the contest type to the create flow, the type icon/badge, and the contest-detail router (`contests/[contestId]/page.tsx`). Re-skin everything to the v2 design system (per `docs/v2-design-guide.md`).

## Edge cases

- **After lock:** answers read-only; question editing locked; result entry + void still allowed.
- **Unanswered question:** 0 points for that member.
- **Void:** removed from every member's total and from the max-points denominator; recompute idempotently. Voiding after settlement re-grades cleanly.
- **Numeric ties:** co-winners, each full points. **Leaderboard ties:** split place money via the shared engine.
- **`no_over` all-over:** nobody scores that question.
- **O/U push (actual == line):** auto-void.
- **Editing a correct answer / rule after entry:** full re-grade, no double-counting.
- **Member joins after lock:** cannot answer (blocked, 0s) — same as Pick'em.
- **Numeric display:** optional duration (mm:ss) hint for anthem-style props; raw number stored and scored.

## Acceptance criteria

- [ ] `contest_type='props'` creatable group-scoped and event-scoped; appears in the create flow with its own type icon/badge.
- [ ] Admin can author questions of all four types, set points, set the single required lock, choose the set-default numeric rule, and override it per question.
- [ ] Members submit one answer per question (auto-saved), editable until the lock, read-only after.
- [ ] Admin "Enter results" settles each question (choice / number / O/U actual) or voids it; scoring recomputes live.
- [ ] Leaderboard ranks by total points, shows provisional standings during settlement, highlights the viewer, and expands to answers-vs-correct.
- [ ] All three numeric rules score correctly, including the `no_over` all-over and O/U push cases.
- [ ] Voiding any question drops it from everyone's scoring and the max total, and re-grades idempotently.
- [ ] Money reuses options/balances + `payout_splits` + `computePlacePayouts`; ties split; winners paid via the ledger. No bespoke money table.
- [ ] Realtime: answers and result entry propagate to open member screens and the home card within ~1s; channels unsubscribe on unmount.
- [ ] Home card shows answered/lock state pre-lock and points/place/winnings post-settlement (same treatment as Pick'em/Auction).

## Notes

- Reference implementation throughout: Pick'em (`pickem.ts`, `pickem-server.ts`, `PickemContent.tsx`, `PickemAdmin.tsx`, `pickem-channel.ts`, `loadPickemPayouts`), plus the auction's phase-aware member board and home card for the results/leaderboard treatment.
- **Future enhancement (out of scope):** optional ESPN auto-settlement for *game-stat* props (total points, first scorer, etc.) using the existing madness-family ESPN client. Novelty props always stay manual.
- Independent of the madness-family epic, but shares the money + leaderboard primitives.
