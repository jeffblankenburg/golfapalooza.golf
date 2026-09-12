## Summary
Per-tenant PWA install is live (each `/new/<slug>` installs as its own app via a dynamic `manifest.webmanifest` + per-org `/new/<slug>/icon`). One gap remains: the legacy iOS **`apple-touch-icon`** is still the global Golfapalooza icon for every org.

## Context
- Modern iOS (16.4+) and Android/Chrome/desktop already use the per-org **manifest icons** (generated from the org's `logo_url` in `src/app/new/[slug]/icon/route.ts`), so those platforms install with the correct per-org icon today.
- The root layout (`src/app/layout.tsx`) hardcodes a global `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`. That file is Golfapalooza's icon, so **older iOS "Add to Home Screen"** (pre-16.4, which reads `apple-touch-icon` rather than the manifest) shows Golfapalooza's icon for *every* org.
- Constraint: do **not** change the original site. The root layout is shared, so the fix must be scoped to `/new/<slug>` only.

## Proposed approach
- In the org subtree layout (`src/app/new/[slug]/layout.tsx`), add a per-org `apple-touch-icon` via `generateMetadata` `icons.apple` (or an injected `<link>`), pointing at the existing dynamic icon route, e.g. `/new/<slug>/icon?size=180`.
- Support a 180×180 size in `src/app/new/[slug]/icon/route.ts` (currently 192/512) since that's the canonical `apple-touch-icon` size.
- Leave the root layout's global `apple-touch-icon` in place as the ultimate fallback (orgs with no logo, and non-`/new` routes).
- Verify: two `apple-touch-icon` links can coexist in `<head>`; confirm iOS picks the per-org one for `/new/<slug>` (iOS generally uses the last/most-specific). If ordering is unreliable, override/remove the inherited link for the `/new` subtree without touching the original.

## Acceptance criteria
- [ ] On an older iOS device, "Add to Home Screen" from `/new/<slug>` uses the org's logo-derived icon (not Golfapalooza's) when the org has a logo.
- [ ] Orgs without a logo still fall back cleanly to the default icon.
- [ ] The original (non-`/new`) site's `apple-touch-icon` behavior is unchanged.
- [ ] No regression to the existing manifest-based per-org icons on modern iOS/Android/desktop.

## Notes
Low priority polish — the manifest path already covers the vast majority of installs. Follow-up to the per-tenant PWA work (commit `6d7c5ed`).
