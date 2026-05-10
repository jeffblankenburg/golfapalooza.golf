# Feature: Admin Sandbox — invisible "test" event for safe experimentation

## Overview

Add a new event status `'test'` that lets an admin create one permanent event that is **completely invisible to Loozers** but **fully visible and editable by admins in "sim mode."** Inside that event, admins can create contests, options, cost items, score entries, etc. using the existing admin tools, with full confidence that nothing they do touches real production data. Real Loozers never see the event, never get notifications from it, never have it appear in their leaderboards or financials.

Scope of this issue: the sandbox itself — status discriminator, admin sim-mode toggle, query helper, dispatch guards. **No populate generators, no presets, no validation suite.** Those would be follow-up issues once we know what actually hurts about using the sandbox manually.

## Problem

Two things this solves at once:

1. **No safe testing surface.** Today, the only way to test scoring / payout / leaderboard behavior end-to-end is to enter real data into the real active event. That's risky during a live tournament and makes "let me see what this looks like" too expensive to be casual.
2. **Untested admin-creation flow.** Most of the contest / option / cost-item creation tools have only ever been used to set up the existing active trip. Whole code paths (creating a contest from scratch in admin UI, attaching cost items, configuring payout splits) have never really been exercised by an admin starting from zero. Building the sandbox forces that flow to get used and reveals where it's broken or missing affordances.

## The architecture in one sentence

> Real data and test data live in tables keyed by `trip_id`. Real has trip_id A. Test has trip_id B. They are physically incapable of mixing.

## Architectural model

### 1. New `trip_settings.status` value: `'test'`

```sql
ALTER TABLE trip_settings DROP CONSTRAINT trip_settings_status_check;
ALTER TABLE trip_settings ADD CONSTRAINT trip_settings_status_check
  CHECK (status IN ('draft', 'active', 'archived', 'test'));
```

The test event is created manually by an admin via the existing event-creation admin tools (or a tiny new button "Create test event" that sets `status='test'` for convenience). Status never moves to `'active'` or `'archived'`. It exists alongside the real active trip indefinitely.

User-facing queries today all filter `.eq("status", "active")`. The test event's `status='test'` makes it invisible to them by definition. Quick audit confirms nothing uses a broader query like `.in("status", [...])` that would accidentally pick up the test event.

### 2. A "trip simulator" admin cookie, parallel to the user simulator

Today, `getEffectiveUserId(realUserId)` checks a `sim-user-id` cookie and returns the simulated user when set. The same pattern extends to trips:

```ts
// New: src/lib/simulator.ts
export async function getEffectiveTripId(): Promise<string | null> {
  const simTripId = cookieStore.get("sim-trip-id")?.value;
  if (simTripId) return simTripId;

  const { data } = await admin.from("trip_settings")
    .select("id").eq("status", "active").maybeSingle();
  return data?.id ?? null;
}
```

When an admin toggles sim mode on (via a button somewhere obvious — header bar or `/admin/sim`), the cookie is set to the test event's trip_id. Every page that calls `getEffectiveTripId()` now sees the test event — leaderboards, Winners grid, financials, scoring tools, admin event-editor, all of it. Toggle off and they snap back to the real active event.

**The refactor cost**: every server-side lookup that does `.eq("status", "active")` to find the active trip needs to switch to `getEffectiveTripId()`. Estimate: ~30–40 call sites; mostly mechanical. Worth it as a one-time investment because every future trip-scoped feature inherits sandbox support for free.

Real Loozers (no admin role, no sim cookie) continue to see only the real active event. Admins without sim-mode toggled also see the real event. Only admins who explicitly opt into sim mode see the test event.

### 3. Sim mode is per-admin

Two admins can use the site simultaneously — one in sim mode, one not. They see different worlds; their actions go to different `trip_id`s. The cookie is per-browser-session for each admin.

### 4. Visual mode banner everywhere

When sim mode is on, the admin's header bar shows a prominent banner: **"🧪 SIM MODE — viewing test event, not real data."** Persistent across navigation. The banner is the one guardrail against an admin forgetting they're in sim mode and being confused that "Loozers can't see the contest I just made."

## Cross-trip leak audit — the tables that don't have a trip_id

A handful of tables don't reference trip_id directly. Each gets a deliberate decision:

| Table | Risk | Decision |
|---|---|---|
| `users` | Identity is shared across all trips. Admin doesn't create fake users in the sandbox. | Keep shared. |
| `player_handicaps` | A handicap belongs to a user, not a trip. | Read-only from sandbox. Sandbox edits never write to handicap calculations. |
| `rounds` (qualifying) | User's summer rounds. Not trip-scoped. | Untouched. |
| `activity_log` | Captures user actions. Sandbox writes would skew analytics. | Sandbox writes are skipped for activity log. Wrap with a guard. |
| `notifications` / push subscriptions | Sandbox must not fire pushes to real users. | Notification dispatch is a no-op when running against a test event. |
| `chat_messages` | Sandbox shouldn't post to real chat rooms. | Chat writes are no-op when running against a test event. |
| `accolades` (winner rows) | Trip-scoped via `trip_id` already. | Cascades cleanly when the test event is deleted/rebuilt. |
| `gallery_items` / photos | Not trip-scoped. | Untouched. |

The riskiest of these is **notifications**. A bug means real Loozers get push notifications about fake events. Mitigation: every notification / chat / activity-log dispatch in the codebase (centralized in `src/lib/notifications/*` and friends) must check whether the current request is operating against a test event — if so, no-op.

This is a one-time audit of every dispatch call site. Manageable; the codebase has them centralized. Implemented as a single guard helper: `if (await isOperatingAgainstTestEvent()) return;`.

## What admin can do inside the sandbox

Everything an admin can do for a real event — using the existing admin tools — works inside the sandbox:

- Create / edit / delete contests
- Create / edit / delete option groups, trip options, choices
- Create / edit / delete cost items, link them to options
- Configure payout sheet events, payout splits
- Manage event days
- Set tee times, assign teams
- Add roster Loozers via `event_participants`
- Run the entire admin scoring flow (scramble scores, daily winners, 100 Feet entry, etc.)
- Trigger payout materializers
- View Winners grid, Payout Denominations tab, leaderboards (all rendered against the test event when sim mode is on)

Nothing on the Loozer side reflects any of it. Real users see the real active event as if the sandbox didn't exist.

## Cleanup

Two equally safe options for "starting over" with the sandbox:

1. **Delete the test event entirely** via the existing event admin tools (`DELETE FROM trip_settings WHERE id = $test_trip_id`). ON DELETE CASCADE handles all child rows. Admin creates a fresh test event.
2. **Selectively delete inside the test event** using existing admin tools (delete contests, options, etc. one by one). Useful when admin just wants to reset one slice.

Both are operations admins can perform with the tools they already have. No new cleanup machinery needed for this phase.

## Admin UI

Minimal:

- **`/admin/sim` (or a header-bar button)**: shows whether sim mode is on; toggles it on/off; shows which trip is currently effective (real active vs. test event); button to create the test event if none exists.
- **Sim mode banner** at the top of every admin layout when sim mode is active.
- **Status badge** on the admin events list distinguishing "TEST" events from real ones.

No populate buttons, no presets, no validation suite, no automated wipe — those are deferred until we know we need them.

## Production safety

1. **Real data is in a different `trip_id`.** Sandbox writes can't reach it because every query is scoped by trip_id and FK. *Structural*, not *policy*.
2. **Test event is invisible to Loozers.** `status='test'` is excluded from every user-facing query (which all use `status='active'`).
3. **Sim mode is a per-admin cookie.** Other admins, and all Loozers, are unaffected.
4. **Notifications and chat dispatches no-op when operating against a test event.** Audited at every dispatch site.
5. **Activity log writes are skipped when operating against a test event.** Analytics stay clean.
6. **Visual mode banner everywhere.** Admin can never confuse "viewing sim" with "viewing real" for more than a glance.
7. **Test event lifecycle is admin-controlled.** Created and maintained by the admin via existing tools. No background processes.

The safety story in one sentence: *even if every other guardrail failed, real Loozer rows live in a different trip_id and the sandbox's writes are mathematically incapable of touching them.*

## What does require code-wide change

1. **`getEffectiveTripId()` adoption**. Every server-side lookup that does `.eq("status", "active")` to find the active trip needs to call the helper instead. ~30–40 call sites. Mechanical refactor.
2. **Dispatch guard audit**. Every site that fires push notifications / chat messages / activity-log writes must check whether it's running against a test event and no-op if so. ~10–15 call sites. Centralized via a single guard helper.
3. **Status filter audit**. Quick grep pass to confirm no query uses a broader status filter that would accidentally pick up `'test'` events.

One-time investments. After they land, every existing and future trip-scoped feature works in the sandbox for free.

## Acceptance criteria

- [ ] Migration extends `trip_settings.status` constraint to include `'test'`
- [ ] Admin can create a test event via existing event admin tools (or a tiny shortcut button)
- [ ] Test events do not appear in any Loozer-facing list, leaderboard, financial view, spectator page, or notification target
- [ ] Admin can toggle "sim mode" on/off; the toggle persists per-admin in a cookie
- [ ] When sim mode is on, every admin page renders against the test event (Winners grid, leaderboards, financials, scoring tools, event editor)
- [ ] Admin can use existing admin tools to create / edit / delete contests, options, cost items, scores, etc. inside the test event
- [ ] No notifications, chat messages, or activity-log entries are produced by activity in the test event
- [ ] Real Loozers and non-sim-mode admins see only the real active event — never the test event
- [ ] Sim mode banner is visible on every admin page when sim mode is enabled
- [ ] Multiple admins can use the site simultaneously with different sim-mode states
- [ ] Tool is safe to use on the production site during an active tournament
- [ ] Deleting the test event via existing tools cleanly cascades all of its child rows; zero orphans, zero impact on real data

## Decisions locked in (2026-05-10)

- **One permanent test event**, manually created and maintained by an admin via existing tools.
- **Discriminator is `status='test'`** on `trip_settings` (new value in the status check constraint).
- **No populate / generator / preset / validation machinery in this issue.** Defer until manual sandbox usage tells us what's missing.
- **`/admin/sim` has a "Create test event" shortcut button.** Inserts a `status='test'` row with a pre-filled name ("🧪 Test Event"). Disabled when one already exists.
- **`getEffectiveTripId()` rolls out in one sweep PR**, gated by tests. Partial adoption would create more confusion than it saves.

## Phases

This is small enough to ship in one phase:

1. Migration to extend `trip_settings.status` constraint
2. `getEffectiveTripId()` helper + sweep of `.eq("status", "active")` call sites
3. Sim-mode cookie + per-admin toggle on `/admin/sim`
4. Sim banner in admin layout
5. Notification / chat / activity-log dispatch guard helper + audit pass
6. Status filter audit (grep + fix)
7. "TEST" badge on admin events list
8. Acceptance test: create test event, configure a couple of contests, switch sim mode on/off, confirm real data unchanged

## Effort estimate

**3–5 days active coding.** The bulk of the work is the `getEffectiveTripId()` refactor across ~30–40 call sites and the dispatch-guard audit across ~10–15 sites. The actual feature surface area is tiny.

## Future follow-up issues (deferred)

Once the sandbox is in use, these naturally surface as next steps:

- **Populate generators**: realistic-data generators for contests so admins don't have to hand-enter every score (the original full-simulator scope, but pared back to what's actually missing after manual use reveals the gaps)
- **Validation suite**: 25-check correctness pass over any trip_id, useful for both sandbox and live-trip health
- **Drift advisory**: warn when the test event's contest shape has drifted from the real active event's
- **Standalone health page** at `/admin/health` that runs the validation suite against the real trip

None of these block the sandbox itself. They become worth building if and when manual usage proves they'd be valuable.

## Dependencies

- Builds on the post-#124 contest spine (contest model, materializers) — but only as a consumer; nothing in this issue changes the spine.
- **Independent of #85 (Duplicate Event).** No clone primitive needed.
- No other feature dependencies. Can ship anytime.
