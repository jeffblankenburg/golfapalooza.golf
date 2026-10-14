**Prerequisite for the whole #223 contest family.** Let a contest belong to the **group (org) directly** — available to **all members**, independent of any event — as a second lane beside the existing event-scoped contests.

## Why (supersedes epic decision #4)
Golf contests are trip-scoped, and the app runs **one active event at a time**. Sports-prediction contests (March Madness, Boxes, pick'em, season pools) aren't trips and shouldn't require or spawn events, nor force multiple concurrent "containers." What's actually wanted is an **event-independent contest available to all group members** — the model bromadness already used (contests were group-level, never tied to a trip).

## Good news: it's bounded, not a re-platform
`org_id` is **already `NOT NULL`** on every relevant table (`v2_contests`, `v2_contest_participants`, `v2_contest_winners`, `v2_cost_items`, `v2_financial_transactions`). The data is already group-tagged. The only thing forcing an event is `event_id NOT NULL`.

## Scope
1. **Nullable `event_id`** (migration) on `v2_contests`, `v2_contest_participants`, `v2_contest_winners`, and the money rows these contests use (`v2_cost_items`, `v2_financial_transactions`). `org_id` stays the tenant scope.
2. **Org-scoped queries/helpers:** when `event_id IS NULL`, scope by `org_id`. Update `createContest`, `setContestBuyIn`, winners/participants reads, and enrollment to accept the org-only path.
3. **Enrollment = all members, opt-in.** Participation comes from `v2_memberships` + an explicit opt-in (buy-in / join the pool), NOT the event roster and NOT `auto_enroll` from `on_roster`.
4. **Lightweight money.** Group contests are buy-in + payout + settle-up (links, per #221). They do **not** use the event-only Options / Trip-Cost / balance apparatus — just a charge + winnings against `org_id`, settled peer-to-peer. (This is how bromadness worked: per-contest entry/payment + a payouts table.)
5. **Group Contests surface.** A members-visible area to browse/join group contests, independent of the active event; an admin create path outside `/admin/events/[eventId]/contests`.

## Two-lane model (the end state)
| Lane | Scope | Roster | Money | Examples |
|---|---|---|---|---|
| Event contests | `event_id` set | event roster (`on_roster`) | full event money (Options, Trip Cost, balances) | golf scramble, skins, CTP |
| Group contests | `event_id` NULL, `org_id` only | all members, opt-in | lightweight buy-in + payout + settle-up | March Madness, Boxes, pick'em, season pools |

## Guardrail
Do not disturb the existing event-contest lane — golf contests keep full event money/roster behavior. This is purely additive (a nullable column + an org-scoped path).

## Acceptance
- [ ] A contest can be created with **no event** (org-scoped).
- [ ] **All group members** can see and opt into it; buy-in records against `org_id`.
- [ ] Winners are paid and settle-up works, with no dependency on an event ledger.
- [ ] The single-active-event model and existing golf contests are untouched.
- [ ] `npm run build` green.

**Blocks:** Phase 1 (#224) and the entire Madness family (#225–#230). Lands before/with Phase 1.
