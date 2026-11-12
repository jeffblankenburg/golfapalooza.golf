# Group switcher — jump between your groups once authenticated

**Depends on custom-domain host locking (#241):** switching behavior differs by host, so the domain-locking decision there defines this. Build host locking first.

## Problem
A member of 2+ groups has no persistent way to jump between them. The `/new` "Your groups" page (`src/app/new/page.tsx`) is the de-facto chooser, but it's only reachable by manually navigating to `/new`, and single-group members are auto-redirected straight past it (`new/page.tsx:22`). The event-shell header logo (`EventShell.tsx:301`) just links to the current group's home, not a switcher. So once you're inside a group there's no affordance to leave for another.

## Goal
A discoverable, always-available way for multi-group members to switch groups, that respects the custom-domain single-org lock.

## UX / placement (decided)
- **Primary: tap the group logo/name in the top-left of the header** to open a switcher bottom-sheet (Slack/Discord pattern, where people expect "which space am I in"). The sheet reuses the `/new` "Your groups" list (logo, name, role, maybe active-event hint).
- **Secondary: a "Switch group" row in the Everything menu** as a labeled backup entry point.
- **Not in Profile** — profile reads as "my account"; switching is navigation.
- **Only render for members of 2+ groups** (nothing to switch to otherwise, mirrors the existing redirect logic).

## Host coupling (the important nuance)
- On the **platform host** (`golfapalooza.golf`): switching is an in-app route change to `/new/[slug]` (or root-slug post-migration).
- On a **custom domain**: the host is locked to one org, so you can't switch in place. The switcher must either be **hidden** on a custom host, or switch by linking **out** to the other group's own custom domain (or `golfapalooza.golf/new/other-slug` when it has none).
- Clean rule: **switching is a platform-host behavior; on a custom domain you're already home.**

## Technical plan
- A small client component (header logo → sheet) fed by the already-loaded `ctx.orgs` (no new fetch; `getPlatformContext` returns the full list).
- Sheet reuses the "Your groups" list rendering; selecting a group routes to its home.
- Gate on `ctx.orgs.length >= 2`.
- Host-awareness: pass a `customHost` flag (from the host-locking work) so the component hides or renders out-links on a custom domain.
- Everything-menu row links to the same sheet or to `/new`.

## Edge cases
- **Single-group member** → no switcher shown anywhere.
- **System admin** → switcher includes the platform console entry point (the `/new` page already special-cases this).
- **Simulator active** → switching groups should respect/clear simulation sanely (don't carry a simulated member across orgs).
- **Custom-domain visitor** → never shows other orgs' chrome inline; out-links only (or hidden).
- **Pending invite to another group** is not a membership → not in the switcher (lives in invites, not here).

## Acceptance
- A 2+-group member can switch from any in-app screen via the header logo, landing on the other group's home.
- The Everything menu offers the same switch.
- A single-group member never sees the affordance.
- On a custom domain the switcher is hidden or out-links only; it never renders a second org's branding inline.
