v2 currently has only **group-level roles** (`owner` / `admin` / `member` via
`v2_memberships.role`). We need to differentiate three distinct tiers:

1. **System admin** — platform-wide, across all orgs. Manages universal resources
   (the shared course library), platform config, cross-tenant tooling. Not tied
   to any one group.
2. **Group admin** — owner/admin of a specific org (the existing role). Manages
   that group's settings, features, members, events.
3. **Group feature admin** — a *member* granted permission to administer a
   **specific feature/module** within their group (NOT a general admin). e.g.
   "can run the Calcutta" or "can manage Chat rooms" without full group admin.

## Likely shape
- **Schema**: a system-admin flag (`v2_profiles.is_system_admin` or a
  `v2_platform_admins` table) + a per-`(org, feature, user)` grant table for
  feature admins (`v2_feature_admins`).
- **Gate helpers** (`src/lib/v2/orgs.ts`): `isSystemAdmin(userId)`,
  `isOrgAdmin` (exists), `isFeatureAdmin(orgId, featureKey, userId)`.
- **Feature registry**: the three-state visibility **"admins"** state, and who
  may edit a feature's config, should resolve to *group admin OR that feature's
  admin*. Group Features config = group admin; a module's own admin surface =
  feature admin.

## Consumers to revisit once this lands
- **Universal course delete** — currently gated on `isAnyOrgAdmin` (any group
  admin). Since courses are shared by every group, this should likely become a
  **system-admin** action. (Shipped now as group-admin as an interim.)
- Group/Event Features config screens (group admin).
- Per-feature module admin surfaces (feature admin) as features are ported.

Foundational; not started. Blocks clean permissioning of ported features.
