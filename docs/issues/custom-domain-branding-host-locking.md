# Custom-domain branding + host locking — a custom domain shows ONLY its org

Entangled with the eventual **/new → root** move; the host→org work should land as one deliberate pass. **Group switcher (#242) depends on this** (switching behavior is defined by whether the host is locked to one org).

## Problem
A visitor to a group's custom domain (e.g. `bromadness.app`) should never see anything but that group's brand — not on the login screen, not on loading screens, not in the title bar. Today only **one** thing is host-aware: `src/app/new/layout.tsx` resolves the org from the `Host` header via `resolveOrgByHost` and applies the brand **color** (`--brand`). Everything else is generic.

**Gaps (what is NOT host-aware today):**
1. **Routing.** `src/middleware.ts` only refreshes the Supabase session. There is no host→org rewrite, so nothing maps `bromadness.app/` to the Bro Madness home; the app still relies on the `/new/[slug]` path. A custom host does not actually route to its org.
2. **Logo + name.** Never derived from the host. The login/signup screen only shows a logo when an `?org=slug` **query param** is present (`src/app/new/signup/page.tsx` fetches `/api/v2/orgs/branding?slug=`). A cold visit to the bare domain gets no logo/name.
3. **Page title + favicon/PWA icons.** Hard-coded `"Golf Platform (preview)"` (`layout.tsx` metadata). Per-org icon/manifest routes exist but are keyed to `/new/[slug]`, not resolved from a custom-domain root.
4. **Loading states.** `loading.tsx` / Suspense fallbacks render at most the brand color, no logo/name.
5. **Group picker leak.** The `/new` "Your groups" chooser is generic platform chrome. A logged-out or multi-group visitor hitting a custom-domain root could see the platform picker instead of the single group.

## Goal
On a verified custom domain, every surface (routing, login, loading, title, favicon, in-app chrome) is locked to the one org that owns the host, for logged-out and logged-in visitors alike. The platform host (`golfapalooza.golf`) keeps its multi-group behavior.

## Technical plan
- **Middleware host resolution.** In `middleware.ts` (or a thin wrapper), resolve the host to an org (reuse/extend `resolveOrgByHost`; cache to avoid a DB hit per request). On a custom host:
  - Stash the resolved org (slug/id/branding) on a request header or cookie the app can read in server components.
  - Rewrite the root (`/`) to that org's home once /new is at root (interim: rewrite to `/new/[slug]`).
  - Treat the domain as **single-org**: never serve the "Your groups" picker; redirect `/new` → the org home.
- **Branding from host, not just `?org=`.** Make the login/signup flow read the resolved org from the host (fall back to `?org=` on the platform host). Surface name + logo + color on login, name-collection, and any pre-auth screen.
- **Metadata + icons.** Generate `metadata` (title, apple-touch, favicon) and the web manifest from the resolved org on a custom host. Drop the "preview" placeholder title.
- **Loading states.** Ensure `loading.tsx`/fallbacks inherit the org logo + name (pass branding down from the host-aware layout, not just the color var).
- **Single-org lock in-app.** On a custom host, suppress anything that implies other groups (the picker, cross-org nav, and later the group switcher).

## Edge cases
- **Unverified / pending-DNS domain** must not skin or route (already enforced in `resolveOrgByHost` via `verified=true`; keep that invariant in middleware).
- **Unmapped host** (default platform host, `*.vercel.app`, localhost) → current multi-group behavior unchanged (`isDefaultHost`).
- **Member of the org vs stranger** hitting the custom host: branding is public either way; access control is unchanged (membership-gated), a stranger still sees branded login, not group data.
- **A user who belongs to multiple groups** landing on one group's custom domain stays locked to that org on that host (switching happens elsewhere, see the switcher issue).
- **Logged-in session from a different org** visiting a custom host → show that host's org home if they're a member; if not a member, branded "you don't have access / request to join," never another org's chrome.
- **PWA installed from a custom domain** should install as that org (icon, name, start_url), independent of other installs.

## Acceptance
- A logged-out visit to `bromadness.app` shows Bro Madness logo, name, color, and title on the login screen and any loading screen, with zero "Golfapalooza"/"preview" chrome.
- Navigating the bare custom-domain root lands on the org home (no manual `/new/[slug]`), and the multi-group picker is never reachable on that host.
- Browser tab title + favicon + installed-PWA identity match the org on a custom domain.
- The platform host retains multi-group behavior unchanged.
- A pending-DNS or unmapped host never borrows another org's branding.
