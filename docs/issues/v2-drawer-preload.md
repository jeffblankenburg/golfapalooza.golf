## Summary

The v2 top-nav drawers (Chat, Photos, Music, Rounds, Notifications, Profile) each
show a loading state *after* the user opens them. Content should be ready — or
much closer to ready — by the time the drawer slides in.

## Current behavior

`EventShell.tsx` renders the drawer body as a conditional mount:

```tsx
open === "photos" ? <PhotosDrawer … /> : null
```

So the lifecycle is: open → component mounts → its `useEffect` fetches fire →
spinner/blank until they resolve. Closing or switching drawers **unmounts and
discards** the fetched data, so the next open refetches from scratch.

Note: `ProfileDrawer`, `NotificationDrawer`, and `RoundsDrawer` already accept an
`active` prop, so they were partly built to survive being kept mounted — but the
ternary unmounts them regardless today.

## Options considered

### A. Mount all drawers always, hide the inactive ones
Render every drawer, toggle visibility via CSS + the existing `active` prop.

- **Pros:** Data fetched once and kept; instant reopen; UI state also survives
  (gallery scroll, half-typed chat message, expanded threads).
- **Cons:** All drawers mount at page load → burst of parallel fetches competing
  with the home page load. Bigger issue is **realtime**: Photos/Chat/Notifications
  each open Supabase `postgres_changes` channels — mounting all means every channel
  is live for the whole session even if never opened, multiplying connections and
  background re-renders. Hidden components still run effects/timers/subscriptions,
  so all of that must be gated on `active`.

### B. Prefetch the *data* only, into a shared cache  (recommended)
Keep mount-on-open, but warm a cache (small module cache or SWR/React Query) with
each drawer's first API page — triggered on shell idle for high-value drawers,
and/or on `pointerdown`/hover of the nav icon. On open, read cache-first (instant)
then revalidate.

- **Pros:** Cheap and targeted; no extra components mounted; **no extra live
  subscriptions**; no startup render cost. Can prioritize likely drawers (Chat,
  Notifications) and skip the rest. Pressing the icon before release already buys
  ~150–300ms.
- **Cons:** Needs a shared fetch layer, so each drawer's fetch must be refactored
  to read cache-first. Preserves *data*, not *UI state* (scroll/inputs still reset).
  Prefetched bytes wasted if the user never opens that drawer.

### C. Keep-alive after first open (hybrid)
Mount lazily on first open, then hide instead of unmount on close.

- **Pros:** Zero startup cost; instant on every open *after* the first; preserves
  full UI state; only pays for drawers actually used.
- **Cons:** The very first open still shows the load (doesn't fix the cold case).
  Same "hidden components keep subscriptions running" concern as A, just deferred.

## Recommendation

**B for the cold-start feel + C for the warm-reopen feel**, and explicitly *not* A
because of the realtime-channel multiplication:

- Prefetch **Chat** and **Notifications** data on idle (the shell already fetches
  their unread counts, so the marginal cost is small).
- Prefetch the others on `pointerdown` of their nav icon.
- Keep a drawer **mounted-but-hidden** once opened so reopens are instant.
- Gate each drawer's subscriptions/timers on `active` so nothing hidden stays chatty.

Suggested starting point: shared cache-first fetch for Chat + Notifications and the
`active`-gating pass, since those are the highest-traffic drawers.

## Caveat

This is not a Next.js route `prefetch` — the drawers are client-state toggles, not
navigations. The work is entirely about warming *our* API cache and managing mount
lifecycle.

Part of the v2 platform build (#177).
