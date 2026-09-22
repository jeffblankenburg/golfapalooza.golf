## Summary
Members need an **archived / inactive** state. A 30-year group (Golfapalooza) accumulates
one-time attendees — the guy who won closest-to-the-pin in year 2 and never came back. We
want him on the books (for accolades / history), but admins don't want him cluttering the
active members list. Archived members drop into a **collapsed accordion at the bottom** of
the directory — findable, but out of the way.

## Model
- **`v2_memberships.archived_at`** (nullable timestamp; migration 00234). Archived = set.
- **Orthogonal to `status` and `role`** (stored on its own column). Kept separate from
  `status` so the service-role directory (which filters `status='active'`) still surfaces
  archived members, and separate from `role` so restoring keeps the member's role.
- **Archived members lose access / can't log in** (migration 00235). Every place that
  RESOLVES a viewer's own membership now also requires `archived_at IS NULL`: the RLS
  predicates `v2_is_org_member`/`v2_is_org_admin`, the `v2_profile_select_self` policy
  (viewer side), `getPlatformContext`, and the TS helpers (`isOrgAdmin`, `isAnyOrgAdmin`,
  `isOrgMember`, `hasPermission`). An archived member resolves as "not a member" for access,
  so they see no org content — while the directory (service role) still lists them.
- Archived members are also dropped from member-facing SURFACES for consistency: the
  everyone-announcement audience + audience picker, chat member list, walk-up roster, and
  birthday banners (home + birthdays page). Directory listings intentionally keep them.
- **Per-org.** Archived in one group ≠ archived in another.

## Behavior (shipped)
- **Directory grid** splits: active members render as before; archived collapse into an
  **"Archived · N"** accordion at the bottom (visible to everyone, collapsed by default).
- **Search spans both** — a query that matches an archived member auto-expands the accordion
  so they're findable ("people can find them if they want").
- **Tree + Map show everyone** (archived included) — archiving declutters the *list*;
  excluding archived would orphan sponsor lineage, and no-show members have no map location
  anyway.
- **Marking is an admin task, in the admin Members manager** (`/admin/members`) — NOT on
  the public member profile. It's modeled as **one status picker alongside the role**:
  the edit drawer's selector offers **Owner / Admin / Member / Archived**. Picking
  "Archived" tucks them away; picking a role restores them. Role & `archived_at` are stored
  on separate axes so restoring never loses the member's role. The member row badge shows
  "archived" (muted) instead of the role. The public profile keeps only a read-only
  "Archived" chip.

## Implementation
- **Migration 00234** — `v2_memberships.archived_at`.
- **`GET/PATCH /api/v2/orgs/[id]/members`** (admin) — GET returns `archived`; PATCH accepts
  `archived` (owner-guarded like role) and sets/clears `archived_at`, never touching role
  or status.
- **`MembersManager`** — the Owner/Admin/Member/Archived picker + muted "archived" badge;
  permissions hidden while archived; can't archive yourself. Archived members are bucketed
  into a **collapsed "Archived · N" group** at the bottom of the admin roster (search
  auto-expands it), mirroring the directory.
- **Migration 00235 + access resolvers** — archived blocks login/access (see Model).
- **`GET /api/v2/members`** — returns `archived` per member (directory).
- **`MembersDirectory`** — active grid + collapsed archived accordion + search auto-expand.
- **`GET /api/v2/members/[id]` + `MemberDetail`** — return + show a read-only "Archived" chip.

## Follow-ups (not in this pass)
- **Bulk archive** — marking 20+ historical no-shows one detail page at a time is tedious;
  a multi-select on the grid (admin) would help.
- **Auto-archive suggestion** — surface members with 0 events in N years as archive
  candidates.
- Optional: hide archived from the map explicitly if their pins ever do clutter.

Part of the members directory work (#187) / Community epic (#172).
