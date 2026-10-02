# v2: attendance-change integrity + immediate admin alerts (Lane A integrity)

Part of #214. Depends on #215. The hard one: a member who was "Attending" when teams/tee times were built later bails, and that quietly breaks a scramble team (empty seat), a tee time, or a Calcutta lot. An admin must **know immediately**.

This is the fix for v1's single biggest weakness here: v1 *computed* guarded-removal warnings and then threw them away — the admin grid (`AttendanceGrid.tsx`) silently discarded them. v2 has a real notification system, so we finish the job.

## What breaks when a participant leaves (v2 today: nothing guards it)
- `v2_scramble_team_members` — an orphaned/empty team seat (no FK cascade, no guard).
- `v2_scramble_hole_scores` — scores tied to a now-broken team.
- `v2_contest_winners` — if they'd already been recorded a winner.
- Tee times — v2 has only a `v2_scramble_teams.tee_time` field today (no pairing table yet); guard the seat, extend when real tee times land.
- Paid Options (#216) — leaving a paid contest must reverse the ledger charge.

## Behavior: never block — detect, remove, and inform

Hard rule (from the "can't be too sticky" principle in #215): **no attendance change or participation edit is ever refused**, even when it breaks downstream state. "Integrity" here means *detect and surface* breakage (and offer cleanup), not *prevent* it. This is a deliberate departure from v1, which refused guarded removals.

**Member drops their own RSVP** (likelihood < 99 via `/api/v2/events/[eventId]/rsvp`): honor reality — they're not coming. Cascade them off teams, Included contests, and opted-in Options (reversing those ledger charges). Then **alert admins** for every contest where it left a hole.

**Admin toggles someone off, or edits a single contest's participants** (the common partial case — left early, or a drop-in added to one round): apply the change as requested — **never blocked**. For any contest where it orphans protected state (empty scramble seat, a tee time, a recorded winner, a Calcutta bid when that lands), raise a **warning + admin alert + "needs attention"** flag so a human fixes the team, rather than silently leaving it broken.

The difference between the two paths is only *scope* (full roster leave vs a single-contest edit), not whether removal is allowed — it always is.

## The alert (the actual new capability)
- New notification type `contest_roster_break` in the v2 notification catalog (`notification-prefs.ts`).
- On a roster-affecting removal, send via `sendV2Notifications` to **all active org owners/admins** (query `v2_memberships` `role IN ('owner','admin')`, `status='active'`, `archived_at IS NULL`). In-app row **and** web push.
- Deep-link `data.url` to the affected contest's Teams page.
- Title/body name the member + what broke ("Dana Reyes left — Team 3 now has an empty seat in Round 1").

## "Needs attention" surfacing (in-app, beyond the push)
- Flag the affected team/contest as **needs attention** (derived: a team with fewer members than expected, or an enrolled seat whose member is no longer `on_roster`). Badge it on the contest list + Teams page so it's visible even if the push is missed.
- No new table needed if derivable; add a lightweight `needs_attention_at` only if derivation is too expensive.

## Edge cases
- Member re-RSVPs "Attending" after bailing: additive re-enroll (per #215), but do **not** silently reinstate a torn-down team seat — leave that to the admin (surface it as resolved/needs-review).
- Simulator-suppressed notifications inherited from `sendV2Notifications`.
- Best-effort alerts: a notification failure never blocks the attendance write.
- Don't double-alert on a no-op (member already off).

## Acceptance criteria
- Removing a member from a contest/team is **never blocked**, even with protected state — it applies, and an alert + "needs attention" flag is raised instead.
- A member dropping RSVP while on a team removes them and fires an admin push + in-app alert deep-linking to that team.
- Admin removing a member who's on a team gets a warning + alert and the affected team is flagged needs-attention (not silently left broken).
- Leaving a paid option reverses the member's ledger charge (coord. #216).
- The affected contest/team shows a "needs attention" badge until an admin resolves it.
- No alert on no-op removals.

## v1 reference
`src/lib/attendance-contest-sync.ts` (`protectedContests`, guarded removal + warnings), `src/lib/roster.ts` (`cascadeRemoveFromRoster`), `src/app/api/admin/attendance/cell/route.ts`, `src/components/admin/AttendanceGrid.tsx` (where warnings were dropped — the gap we're closing). v2 notifications: `src/lib/v2/notifications.ts`, migration `00194_v2_notifications.sql`.
