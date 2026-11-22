# v2 Structural / Routing Cutover Plan (move out of `/new`, host-based routing)

**Goal:** make the v2 app what the site serves at **root** instead of under `/new/[slug]/*`, and route by **request host** in production so a group's custom domain lands on that group, `uproario.us` renders a public marketing landing page, and the bare platform host shows a member their list of groups. Retire the v1 app from root.

**Status of this doc:** plan only. Nothing here has been executed. It reflects the route tree and middleware as of the research pass on 2026-11-18.

**Relationship to the data cutover (#255):** this is the **structural sibling** of `docs/v1-to-v2-cutover-plan.md`. That plan copies/finalizes the data (profiles, chat, rounds, courses, events, attendance); this plan moves the *surface* v2 is served from. They are **independent** — the data can be fully synced while v2 still lives under `/new`, and the routing can be rehearsed on staging before any data freeze. They should be **executed in the same cutover window** (flip the data authoritative, then flip the routing), but neither blocks the other's planning or build. The data plan's §4 step "Flip the app to serve v2 as the primary site" **is this plan**.

---

## 0. The one fact that makes this harder than the data cutover

The data cutover is easy because v1 and v2 share one Supabase project and preserve ids (`INSERT … SELECT … ON CONFLICT`). The structural cutover has no such shortcut: **v2's entire route tree, every internal link, and every server-side deep-link is physically prefixed `/new/[slug]`**, and v1 currently *owns* root (`src/app/(app)`, `(admin)`, `(auth)`, `(public)`, `(fullscreen)`). Making v2 "the site at root" is a routing-and-link problem, not a data problem.

Two things already exist in our favor:

1. **Host resolution is partly built.** `src/lib/v2/domain.ts::resolveOrgByHost(host)` already maps a verified custom hostname → org branding via `v2_org_domains`, and the root `/new` layout already calls it to skin the brand color. `isDefaultHost()` already classifies the platform hosts (`golfapalooza.golf`, `localhost`, `*.vercel.app`) vs tenant domains. The missing piece is using that resolution to pick a **slug/route**, not just a color.
2. **Org resolution from the URL is already centralized.** `getPlatformContext()` (`src/lib/v2/context.ts`) resolves the signed-in user + their orgs; the `[slug]` layout matches the slug against `ctx.orgs`. Nothing reads the slug from a hardcoded constant — it flows from the route param. That makes a host→slug injection point tractable.

**Consequence:** the cleanest cutover does **not** rename 172 files. It introduces a **host→path rewrite layer** in middleware so that public URLs lose `/new/<slug>` while the physical App Router tree keeps it (at least initially), then migrates links opportunistically. See §3.

---

## 1. What exists today (the starting state)

### 1a. The `/new` route tree
```
src/app/new/
  layout.tsx            theme wrapper; calls resolveOrgByHost(host) for brand color only
  page.tsx              the group-list / chooser (the "bare root" view, see §2 case C)
  create/               create a group
  join/[code]/          accept an invite
  signup/               new-user signup (brandable via ?org=slug)
  admin/                platform (system) admin console
  [slug]/
    layout.tsx          OrgLayout — per-org PWA manifest/icon metadata, Music/Soundboard/NameMode providers, brand color override
    manifest.webmanifest/route.ts   per-org PWA manifest (id/start_url/scope = /new/<slug>)
    icon/               per-org composited app icon (PNG)
    PwaRegistrar.tsx    registers /sw.js
    (event)/            the member app shell (announcements, articles, members, schedule, contests, money, threes, pickem, props, courses, balance, options, birthdays, ...)
    admin/              group admin (events, contests, financials, features, members, music, settings, simulator, tournaments, ...)
    rounds/[id]/        scoring
```

### 1b. Middleware today
`src/middleware.ts` → `updateSession()` (`src/lib/supabase/middleware.ts`) does **only** Supabase session refresh + auth gating:
- Refreshes the session, defines `isAuthRoute` (`/login`, `/verify`), `isPublicRoute` (`/spectator`, `/new/<slug>/rounds/<id>/watch`, `/privacy`, `/terms`), everything else protected.
- Anonymous + protected → redirect `/login`. Signed-in + on an auth page → redirect `/`.
- One existing rewrite: anonymous hit on `/articles/:id` → internal rewrite to `/spectator/articles/:id`.
- **No host logic at all today.** The matcher already special-cases the per-org PWA manifest/icon under `/new` so browsers can fetch them uncredentialed (`new/[^/]+/icon$`, `*.webmanifest`).

### 1c. v1 owns root
`src/app/(app)/page.tsx` is the v1 home at `/`. v1 route groups `(app)`, `(admin)`, `(auth)`, `(public)`, `(fullscreen)` plus top-level `privacy`, `terms`, `calcutta-display`, `squares-sim` all live at root. **v2 cannot take `/` until v1's root routes vacate or are redirected** (§5).

### 1d. Scope of the hardcoded `/new/` prefix
Measured on 2026-11-18 (larger than earlier rough estimates):
- **172 files** contain `/new/`; **469 total occurrences**.
- `href=` attributes referencing `/new/`: ~69 (65 are backtick template literals like `href={`/new/${slug}/…`}`).
- `router.push` / `router.replace` to `/new/`: ~18.
- Server-side `redirect("/new/…")`: ~109 (the bulk — guards in server components that bounce non-members, admins, etc.).
- **Notification / feed deep-links in `src/lib/v2`** (the ~8 that matter most because they get persisted into already-sent pushes and activity rows): `announcements.ts`, `articles.ts`, `onboarding.ts`, `features.ts` (the `FEATURE_HREFS` map, ~11 feature routes), `schedule-feed.ts`, `rounds/notify.ts` (score + completion), `rounds/round-activity.ts`, `rounds/favorites-fanout.ts` (watch URL), `contests/enrollment.ts` (teams URL).

All of these are **slug-interpolated**, never a bare `/new`. That is what makes a rewrite layer viable: the slug is always present, so a prefix-strip is mechanical.

---

## 2. Host → route: the production model

Three cases, keyed off the request `Host` header. Dev differs (no custom domains locally).

**Case A — a group's custom domain** (e.g. `golfapalooza.app`, `bromadness.com`):
`resolveOrgByHost(host)` → org → **serve that org's app** (the prod equivalent of `localhost:3000/<slug>`). The URL the visitor sees has **no slug** (`golfapalooza.app/schedule`), but internally it resolves to the org from the host. This is the custom-domain skinning noted as unbuilt in memory (`project_v2_org_logo_propagation`) and partly covered by **#241** (custom-domain branding + host locking).

**Case B — `uproario.us` (the reserved marketing host):**
Renders a **public, no-auth marketing landing page** (net-new, §8). It is explicitly **NOT** a group and NOT the group chooser. Pitches "an online space for your friend trip / golf league / Vegas trip" and routes visitors to signup/join. `uproario.us` must be added to the host classifier as a **third kind** (today `isDefaultHost` only knows "default platform" vs "tenant custom domain"; the marketing host is neither — it should render marketing, not the chooser and not an org).

**Case C — bare platform root with no mapped host** (`golfapalooza.golf`, `localhost`, `*.vercel.app`, or any host not in `v2_org_domains`):
Signed-in → the **member's list of groups** (today's `/new/page.tsx` chooser). Not signed in → login/signup. A member of exactly one group is already auto-forwarded into it (existing logic in `page.tsx`). This is also the host the **group switcher (#242)** lives on, and the fallback a locked custom domain out-links to via `PLATFORM_ORIGIN` (already defined in `domain.ts`).

### Dev vs prod
- **Today in dev:** `localhost:3000/new/<slug>` (path-based). `isDefaultHost("localhost:3000")` is true, so no host skinning.
- **Prod goal:** host-based (Case A). Custom domains aren't testable on `localhost`.
- **Recommendation:** keep **path-based routing permanently available on the platform host** (Case C can still accept `/<slug>` in the URL), so dev stays `localhost:3000/<slug>` and preview deploys on `*.vercel.app` keep working without DNS. Host-based routing (Case A) is *additive* on top of path-based — the host rewrite injects the slug; a literal slug in the path also works. This avoids a dev-only code path.

### Where org resolution moves
Org resolution stays in the **route param** (`[slug]`), and the **host→slug mapping moves into middleware**. Middleware looks up the host; on a custom domain it **rewrites** `host.app/schedule` → `/new/<slug>/schedule` (or the post-move equivalent) before the App Router sees it. The page tree keeps reading `params.slug` unchanged. This is the smallest-blast-radius injection point — nothing downstream of middleware needs to know whether the slug came from the path or the host.

---

## 3. The path move: `/new/[slug]/*` → root

Two strategies. They are not mutually exclusive — the recommendation uses both in sequence.

### Option 1 — Mass path rewrite (physically move files + rewrite 469 references)
Move `src/app/new/[slug]/*` to `src/app/[slug]/*` (or to the appropriate host-resolved group), delete `/new`, and rewrite every `/new/<slug>/…` string to `/<slug>/…` (or to a slug-less relative form).
- **Pro:** URLs are "real," no rewrite layer to reason about, simplest mental model long-term.
- **Con:** 172 files / 469 edits, high churn, risk of missing a server `redirect` or a persisted deep-link; collides with v1's root route groups (a top-level `[slug]` catch-all competes with `(app)`, `/privacy`, `/spectator`, `/api`, etc. — Next.js route-group precedence makes this fragile while v1 still exists).

### Option 2 — Rewrite/redirect layer (public URLs change, links mostly don't)
Keep the physical tree at `/new/[slug]` initially. In middleware:
- **Custom domain (Case A):** rewrite incoming slug-less path → internal `/new/<slug>/<path>`.
- **Platform host (Case C):** rewrite `/<slug>/<path>` → `/new/<slug>/<path>` (and keep `/new/<slug>/…` working as a legacy alias).
- Public URLs lose `/new`; internal links that still say `/new/<slug>` keep resolving because the physical tree is unchanged.
- **Pro:** ships the host model and the clean public URLs **without** touching 172 files first; link rewrites become a follow-up cleanup, not a blocker; reversible (remove the rewrite). 
- **Con:** two layers to reason about; the `/new` prefix lingers internally; an SEO canonicalization step is needed so both forms don't index.

### Recommendation
**Phase the move: Option 2 first, then Option 1 as cleanup.** Ship the host→slug rewrite + slug-less public URLs via middleware (Option 2) so the brand/routing goes live with minimal churn and full reversibility. Then, on a later pass with no deadline pressure, physically relocate the tree and rewrite the string references (Option 1), removing the rewrite layer. This matches the repo's "best solution, not fastest" posture while de-risking the live flip: the risky 469-edit churn is decoupled from the irreversible brand/host launch.

**The one thing that must be fixed at flip time regardless of phase:** the ~8 persisted deep-links in `src/lib/v2` (§4). Those get written into push payloads and `v2_activity` rows; a rewrite layer can keep old ones resolving, but new rows should be written in the final form so we're not depending on the rewrite layer forever.

---

## 4. Notification & feed deep-links

The ~8 `src/lib/v2` producers listed in §1d write `/new/<slug>/…` into:
- **Push payloads** (`rounds/notify.ts`, `contests/enrollment.ts`, `announcements.ts`, `articles.ts`) consumed by `public/sw.js` `notificationclick` → `clients.openWindow(urlToOpen)`.
- **Activity / feed rows** (`round-activity.ts`, `schedule-feed.ts`, `features.ts` `FEATURE_HREFS`, `favorites-fanout.ts`).

**Tolerance for already-sent pushes:** a push already delivered to a device carries its URL forever; we cannot rewrite it. **Mitigation:** the middleware rewrite layer (Option 2) must keep `/new/<slug>/…` resolving **permanently** (or at least for a long tail), so historical pushes still open. New rows get written in the final (slug-less or new) form once link cleanup lands. This is the main reason the `/new` legacy alias should **not** be hard-removed at flip.

**Build item:** centralize deep-link construction. Today each producer hand-builds the string. A single `buildDeepLink(slug, path)` (or host-aware variant) lets the final form change in one place and keeps the form consistent across push + feed.

---

## 5. v1 retirement + redirects

v2 cannot own `/` while v1's `(app)/page.tsx` is the root page. Posture mirrors the data plan: **additive and reversible**, not a destructive delete.

Recommended sequence:
1. **Freeze v1 writes** (shared with the data cutover's freeze step — one window).
2. **Redirect v1 root routes to their v2 equivalents** where a mapping exists (e.g. `/` → group home, `/my-rounds` → `/<slug>/rounds`, `/schedule` → `/<slug>/schedule`). Many v1 routes have no clean 1:1 v2 route; for those, redirect to the group home rather than 404.
3. **Keep v1 route files in the repo** (not deleted) during the rollback window, behind the redirects, so a flip-back is a config change, not a revert.
4. **`/spectator` stays** — it's public and already used by both the v1 `(public)` group and middleware. Decide whether the spectator surface moves under the host model or stays at `golfapalooza.golf/spectator` (recommend: stays at the platform host; it's Golfapalooza-specific content, not multi-tenant).
5. `/privacy`, `/terms` stay at root (referenced by middleware public-route checks and signup).

**Open question:** whether v1 is redirected wholesale to the group home or route-by-route. Route-by-route is more work but avoids dumping users who deep-linked an old URL onto a generic home. List pending for the user.

---

## 6. PWA continuity (the sharpest risk)

**Existing installs point at root.** Today's v1 users have the app installed from `public/manifest.json` with `start_url: "/"`, `scope` implicitly `/`, registered `/sw.js`. v2 installs use the **per-org** manifest (`/new/<slug>/manifest.webmanifest`) with `id`/`start_url`/`scope` = `/new/<slug>`.

When root becomes v2, the installed-app behavior must be reasoned about carefully:

- **The v1 install's `start_url: "/"`** will now open **v2's root** (the group chooser or a host-resolved group). That is actually *desirable* for the cutover (existing installs land on the new app) — but it's a silent experience swap. It must be verified on a real device, not assumed.
- **Service worker continuity:** both v1 and v2 register the **same `/sw.js`** (the v2 `PwaRegistrar` registers `/sw.js` verbatim). So there is no SW swap — good. But if `start_url`/`scope` change in the root manifest, installed clients may re-prompt or re-scope. Keep `/sw.js` byte-stable through the flip; change the SW on its own later if needed.
- **The root manifest** (`public/manifest.json`) currently brands "Golfapalooza" generically. After the move, decide what root's manifest represents: on `uproario.us` it should be the Uproarious marketing/app shell; on a custom domain, the **per-org** manifest should win (the per-org manifest/icon routes must be reachable at the new, slug-less path). The per-org manifest currently hardcodes `start_url`/`scope`/`id` to `/new/<slug>` — these must be regenerated to the host-relative path (e.g. `start_url: "/"` on a custom domain) or installs will scope to a `/new` path that no longer exists publicly.
- **Per-org icon/manifest routes move out of `/new`.** The middleware matcher special-cases `new/[^/]+/icon$` and `*.webmanifest` for uncredentialed fetch. When these move (or when the host rewrite exposes them slug-less), the matcher must be updated so browsers can still fetch them without the auth redirect.
- **Apple touch icon / splash** (#179 per-org apple-touch-icon, #256 per-group iOS splash) intersect here: whatever path those land on must survive the move. Link, don't duplicate.

**Recommendation:** treat PWA as its own verification lane (§9). The failure mode is silent — an installed user whose app opens a `/new`-scoped URL that 404s, or who gets re-prompted to reinstall. Test a pre-existing install through the flip on iOS + Android before calling it done.

---

## 7. Auth / session continuity

- **Cookie path:** Supabase SSR cookies are set via `cookieStore.set(name, value, options)` with **no explicit `path`** (`src/lib/v2/supabase.ts`, `src/lib/supabase/middleware.ts`), so they default to `/` and already span both `/new` and root. **No cookie-path change needed** for the path move. (Confirm `@supabase/ssr` isn't narrowing the path — a quick runtime check of the Set-Cookie header is cheap insurance.)
- **Redirect targets:** middleware sends anonymous→`/login` and signed-in-on-auth-page→`/`. `/login` and `/verify` live in v1's `(auth)` group and `verify/page.tsx` does `window.location.href = "/"` on success. After the flip, `/` is v2 — so a successful login lands on v2's root (chooser or host-resolved group). That's the desired behavior, but the auth pages themselves (`/login`, `/verify`) are v1 surfaces. Decide whether to keep the shared v1 auth pages (simplest — one auth flow for both) or move auth under the v2 tree. **Recommendation:** keep the shared `/login`/`/verify` at root; they're already host-agnostic and both apps use them. `signup` has a v2-native page (`/new/signup`, brandable via `?org=`) that should move to a slug-less `/signup`.
- **`?org=` branding on signup** must survive: the marketing host (`uproario.us`) and custom domains both funnel into signup; the host should seed the brand the way `?org=slug` does today.

---

## 8. The `uproario.us` marketing landing page (net-new)

A **public, no-auth** landing page, separate from the group chooser and from any org. Build notes:
- Rendered when `Host === uproario.us` (new host classification). Must **not** require a session and must **not** show the chooser.
- Content: the pitch ("an online space for your friend trip, golf league, Vegas trip, bachelorette party, with the games and mayhem inside"), CTAs to **signup** / **join with a code** / **create a group**.
- Uses `v2AdminClient()` for any public data (same pattern as spectator pages), exposes nothing private.
- SEO: this is the indexable brand home; set canonical, OG tags, robots-allow. (By contrast, custom-domain org pages and the platform chooser should be noindex or canonicalized to avoid duplicate-content across hosts.)
- Keep it its own route segment so it can evolve independently of the app shell.

---

## 9. Decisions

**Recommended defaults (treat as settled unless the user objects):**
1. **Rewrite layer first, physical move later (§3).** Ship host routing + slug-less URLs via middleware rewrite; do the 469-edit physical relocation as a no-deadline follow-up.
2. **Keep path-based routing on the platform host permanently (§2).** Dev stays `localhost:3000/<slug>`; preview deploys keep working; host routing is additive.
3. **Keep `/new/<slug>/…` resolving permanently as a legacy alias (§4, §6).** Already-sent pushes and old installs depend on it; never hard-remove.
4. **Keep shared `/login` + `/verify` at root (§7).** Move only `signup` to a slug-less `/signup`.
5. **`/spectator`, `/privacy`, `/terms` stay at the platform host (§5).** Spectator is Golfapalooza-specific, not multi-tenant.
6. **Keep `/sw.js` byte-stable through the flip (§6).** Change the SW separately, never in the same window.
7. **Per-org manifest `start_url`/`scope`/`id` regenerate to host-relative on custom domains (§6).**

**Genuinely open (need the user's call — not invented here):**
A. **v1 retirement granularity (§5):** wholesale redirect-to-group-home vs route-by-route redirects. More work vs better deep-link UX.
B. **Does the group chooser (Case C) live on `golfapalooza.golf`, `uproario.us`, or a distinct `app.uproario.us`?** The memory says bare root shows the chooser, but whether that host is the marketing host, the current platform host, or a new app subdomain is unresolved. This affects where #242 (group switcher) renders.
C. **Spectator under the host model:** does a custom domain expose a spectator surface, or does spectator stay only on the platform host? (Recommend platform-only, but confirm.)
D. **Canonical host for an org:** when an org has a custom domain AND is reachable at `platform/<slug>`, which is canonical for SEO/sharing? (#241 host-locking is adjacent.)
E. **Marketing-host app install:** should `uproario.us` be installable as its own PWA (the "Uproarious" app) separate from per-group installs, or is it web-only?

---

## 10. Verification

**Per-host routing:**
- `curl -H "Host: <org-custom-domain>" …/schedule` resolves to that org (Case A), slug-less URL.
- `curl -H "Host: uproario.us" /` returns the marketing page, no auth redirect, no chooser (Case B).
- `curl -H "Host: golfapalooza.golf" /` (signed-in) returns the group chooser; a one-group member is forwarded into their group (Case C).
- An unmapped/unknown custom host falls back to Case C, does not 500.
- A **pending** (unverified) `v2_org_domains` row does NOT skin or route (reuse `resolveOrgByHost`'s `verified` filter) — a squatted domain can't hijack.

**Link integrity:**
- Crawl the running app for `href`/redirect targets; confirm no broken `/new`-prefixed link after the rewrite, and that persisted deep-links (push URLs, `v2_activity.link`, `FEATURE_HREFS`) still open the right page.
- Fire one of each notification type (round score, announcement, article, contest teams) and confirm `notificationclick` opens the correct page on a real device.

**PWA:**
- Installed v1 PWA (`start_url:"/"`) opens v2 after the flip without a 404 or reinstall prompt — verify on iOS + Android.
- Per-org manifest + icon fetch uncredentialed at the new path (middleware matcher updated).
- `/sw.js` is byte-identical before/after; no unexpected SW update cycle.

**Auth:**
- Login → lands on v2 root; signed-in user hitting `/login` is bounced to `/`; cookie `Path=/` confirmed on the Set-Cookie header.

**SEO:**
- Marketing host indexable; org/custom-domain duplicates canonicalized or noindexed; no two hosts serving identical indexable content.

---

## 11. Rollback

Same additive, non-destructive posture as the data plan. Because the recommended approach is a **middleware rewrite layer** plus **redirects** (not a file deletion):
- **Flip back = remove the host rewrite + the v1→v2 redirects.** v1 route files are still present (§5 keeps them), v2 still lives under `/new`, so v1 instantly owns root again.
- The per-org manifest change and the `uproario.us` marketing route are additive; disabling them doesn't break v1.
- Only after a defined window (match the data plan's 2–4 weeks) and confidence should the physical relocation (Option 1) and v1 route-file deletion happen — those are the irreversible steps and should be a *separate, later* decision, not part of the live flip.

---

## 12. Pre-cutover build backlog (ordered by dependency)

Each item is sized as a future GitHub sub-issue. Items 1–4 are the critical path to flipping; 5–7 are the clean-up / polish that can trail.

1. **Host classifier + marketing-host case.** Extend `domain.ts` to recognize `uproario.us` as a third kind (marketing), distinct from default-platform and tenant-custom. Add the host→kind resolver middleware will consume. *Blocks everything.*
2. **Host→slug rewrite in middleware.** On a verified custom domain, rewrite slug-less path → internal `/new/<slug>/<path>`; on the platform host, accept `/<slug>/<path>` and keep `/new/<slug>/…` as a legacy alias. Update the matcher so per-org manifest/icon stay uncredentialed at the new paths. Fold into the existing `updateSession` or a composed middleware. (Links to **#241**, **#242**.)
3. **`uproario.us` marketing landing page.** Net-new public no-auth route with signup/join/create CTAs, OG/SEO, `v2AdminClient` for any public data. (§8)
4. **v1 root retirement + redirects.** Map v1 root routes → v2 equivalents (or group home); keep v1 files behind redirects for rollback. (§5) *Blocks v2 owning `/`.*
5. **Per-org manifest/icon + PWA continuity fixes.** Regenerate `start_url`/`scope`/`id` host-relative; verify installed-app swap on iOS/Android; keep `/sw.js` stable. Coordinate with **#179** (apple-touch-icon) and **#256** (iOS splash). (§6)
6. **Centralized deep-link builder + final-form link cleanup.** Introduce `buildDeepLink(slug, path)`; migrate the ~8 `src/lib/v2` producers and the `FEATURE_HREFS` map; begin the broader 469-reference rewrite as the Option-1 cleanup pass. (§3, §4)
7. **Physical route relocation + legacy-alias removal (the big, no-deadline one).** Move `src/app/new/[slug]/*` to its root home, delete `/new`, remove the rewrite's legacy alias, delete dormant v1 route files. Only after the rollback window. (§3 Option 1)

Items 1–4 gate the live flip. Items 5–7 are safe to trail and are where the real churn (and the irreversible deletes) live.

---

## Appendix — key files

- **Middleware / session:** `src/middleware.ts`, `src/lib/supabase/middleware.ts`
- **Host → org resolution:** `src/lib/v2/domain.ts` (`resolveOrgByHost`, `isDefaultHost`, `PLATFORM_ORIGIN`, `v2_org_domains`)
- **Platform context / slug resolution:** `src/lib/v2/context.ts` (`getPlatformContext`)
- **`/new` tree:** `src/app/new/layout.tsx` (host brand), `src/app/new/page.tsx` (chooser / Case C), `src/app/new/[slug]/layout.tsx` (`OrgLayout`), `src/app/new/signup/page.tsx` (`?org=` branding), `src/app/new/create/page.tsx`, `src/app/new/join/[code]/`, `src/app/new/admin/`
- **PWA:** `src/app/new/[slug]/manifest.webmanifest/route.ts`, `src/app/new/[slug]/icon/`, `src/app/new/[slug]/PwaRegistrar.tsx`, `public/sw.js`, `public/manifest.json`
- **Persisted deep-links (`src/lib/v2`):** `announcements.ts`, `articles.ts`, `onboarding.ts`, `features.ts` (`FEATURE_HREFS`), `schedule-feed.ts`, `rounds/notify.ts`, `rounds/round-activity.ts`, `rounds/favorites-fanout.ts`, `contests/enrollment.ts`
- **v1 at root (must vacate/redirect):** `src/app/(app)/`, `src/app/(admin)/`, `src/app/(auth)/{login,verify}/`, `src/app/(public)/spectator/`, `src/app/{privacy,terms,calcutta-display,squares-sim}/`
- **Supabase cookie clients:** `src/lib/v2/supabase.ts`, `src/lib/supabase/middleware.ts`
- **Sibling plan:** `docs/v1-to-v2-cutover-plan.md` (data cutover, GH epic #255)
- **Adjacent issues:** #241 (custom-domain branding + host locking), #242 (group switcher), #244 (capability domains), #179 (per-org apple-touch-icon), #256 (per-group iOS splash), #234 (parity tracking), #255 (data cutover epic)
