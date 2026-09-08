# Epic: Multi-tenant platform rebuild (the `/new` app)

Turn the single-group, hardcoded-contest app into a reusable **"golf group in a
box"** platform: an admin creates an org + event, enables **contests as modules**,
and configures their rules — no code changes to run an event.

Built **in the same repo under `/new`**, alongside the current app, so nothing
disrupts live users. Cutover later = promote `/new` to root + backfill `org_id`.

## Locked decisions
- **Ambition:** multi-tenant-ready now; onboard groups manually (no billing/self-serve yet).
- **Strategy:** same repo, new routes under `/new`; **same Supabase project**; additive **`v2_`-prefixed** tables only — never alter existing tables.
- **Contests:** prebuilt, configurable modules (new *types* still need a dev; running/configuring an event does not).
- **Membership:** global identity (existing `users`/`auth.users`); one user in many orgs via `v2_memberships`; **invite codes** (org-level for now); retire the founders/`sponsor_id` model.
- **My Rounds/handicaps:** stay **user-global**; `/new` reads existing `rounds`/handicap/course tables directly (optional event attachment later).
- **Branding:** name/logo/colors per org for v1; full theming after conversion.
- **Custom domains:** orgs can point their own hostname at the app; it resolves the org from the request Host and skins itself (incl. logged-out visitors) via `v2_org_domains`.

## Target model
```
Organization (tenant, v2_organizations)
  ├─ v2_org_domains   (many hostnames → skinning)
  ├─ v2_memberships   (user ↔ org, role: owner/admin/member)
  ├─ v2_invites       (code-based join)
  └─ v2_events        (many per org; no single-"active" assumption)
        └─ v2_contests (enabled module + validated `config` JSONB)  [Phase 2]
```
- Isolation: `org_id` on every tenant table; **membership-based RLS** via `v2_is_org_member()` / `v2_is_org_admin()` SECURITY DEFINER helpers.
- Org branding + domain rows are public-readable (skinning before auth); everything else is membership-gated.

## Module contract (Phase 2)
Each contest type = a code `ModuleDefinition` { type, configSchema (Zod),
defaultConfig, dependsOn, capabilities, resolveWinners(), UI }. Each instance is
a `v2_contests` row with a schema-validated `config` JSONB. Existing resolvers
(`scramble.ts`, `cornhole.ts`, `daily-pots.ts`, `skins.ts`, `bspitw.ts`, KGB
match-logic) become the `resolveWinners` implementations; the
`contest_winners`/`payout_splits`/`cost_items` plumbing carries over.

## Phases
- **Phase 0 — Foundations (in progress):** `/new` shell + host→org skinning; `v2_organizations/org_domains/memberships/invites/events` + RLS; Golfapalooza seeded as org #1; landing lists a user's orgs/events. → migration `00178_platform_tenancy.sql`.
- **Phase 1 — Always-on UIs over shared data:** Music → My Rounds → Chat → Gallery under `/new` (no data port; reads existing tables).
- **Phase 2 — Module framework:** registry + schema-driven admin config + generic winner/payout materialization on `v2_contests`; prove with Scramble(+Skins) and Pick'em.
- **Phase 3 — Remaining modules:** Calcutta, Cornhole, KGB/Ryder, Daily CTP/LD, BSPITW, side bets.
- **Phase 4 — Financials per event:** cost_items, winners grid, denominations, payout sheet scoped to (org, event).
- **Phase 5 — Multi-org hardening:** manual onboarding, custom-domain verification flow + middleware, per-org roles/spectator/cron; add `org_id` to shared tables (nullable, defaults to org #1).
- **Phase 6 — Cutover:** promote `/new` to root; backfill `org_id`; retire old routes.

## Risks
- RLS tenant-isolation leaks → one membership-based pattern + isolation tests on every table.
- Realtime channels must be keyed per org/event.
- Scoring parity (see the adjusted-handicap tiebreak bug) → port resolvers with unit tests.
- Custom-domain verification (don't let an unverified domain hijack branding) — only `verified=true` domains skin.

## Open (non-blocking)
- Event-level invites (additive column later).
- Custom-domain verification UX + automated TLS/SSL provisioning.
