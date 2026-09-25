Dev/admin tooling to make building group features (which only others can see) testable — parity with v1's user + time simulators.

## Shipped: user simulator
View the app AS another member of a group you administer.

- **Gate (safe, multi-tenant):** you may simulate a member only if you're an active owner/admin of an org they belong to. Re-verified on **every request** in `resolveEffectiveUser` (the `v2_sim_user` cookie is never trusted alone) and again when entering sim (`POST /api/v2/sim`).
- **Mechanism:** the two identity chokepoints resolve the *effective* user id — `v2GetUser` (APIs) and `getPlatformContext` (pages) — so the whole app acts as the simulated member with no per-route changes. When simulating, `getPlatformContext` reads the target's memberships via the service-role client (RLS can't see another user's rows).
- **Enter:** admin-only "View as member" picker in the Profile drawer (`SimControl`).
- **Exit:** persistent floating "Viewing as ___ · Exit" banner (`SimBanner`), mounted in the `[slug]` layout while `ctx.simulating`.
- **API:** `POST /api/v2/sim { userId }` / `DELETE /api/v2/sim`.
- Files: `src/lib/v2/simulator.ts`, `src/app/api/v2/sim/route.ts`, `SimControl.tsx`, `SimBanner.tsx`; edits to `supabase.ts` (`v2GetUser`), `context.ts` (`getPlatformContext` now returns `realUserId`, `simulating`, `simName`).

### Known limitations
- The returned RLS client stays bound to the real session. v2 reads/writes overwhelmingly use the service-role client filtered by the effective `userId`, which is swapped — but any route relying purely on RLS `auth.uid()` (no explicit userId filter) would still act as the real user.
- Native (bearer) requests don't carry the cookie → no simulation on native.
- Writes while simulating are attributed to the simulated member (by design; the banner mitigates footguns).

## Next: time simulator (deferred)
Override "now" to test time-gated features (feature availability windows, event dates, article publish, birthdays, scheduled polls).

- v2 has **no central clock** — it calls `new Date()` inline everywhere. Plan: add a `v2_sim_at` cookie + a `v2Now()` helper (gated like the user sim), then wire it into the server-evaluated time gates that matter. Won't cover DB `NOW()` defaults or client-side clocks — document that.
- Add date/time controls to the same admin surface + reflect in the sim banner.
