# Feature: App-wide loading states

## Problem

Pages and buttons in the app often take a beat before responding — server-side data fetches, route transitions, and async POSTs all leave the UI silent for ≥200ms. With no feedback, users:

- Tap the same button multiple times
- Assume the app is broken
- Navigate away before the action finishes

We don't currently have a consistent answer for "I clicked something — did anything happen?" Some places have spinners, some don't, the patterns differ, and most navigations land on a blank white screen until the destination renders.

## Goals

1. **Acknowledge every click within 100ms** — even if the action takes a second to complete, the user sees that we registered their input.
2. **Show meaningful structure during slow loads**, not a blank screen.
3. **Disable the trigger** while an async action is in flight so the user can't double-fire.
4. **Keep the patterns consistent** across navigation, form submits, and AJAX buttons so users learn one mental model.

## User Experience

### Three feedback levels, picked by latency budget

| Pattern | When to use | Visual |
|--------|-------------|--------|
| **Press state** | Always (every interactive element) | Existing `active:scale-95` / `active:bg-gray-50` — already in place |
| **In-button spinner** | Async actions ≤2s (RSVP, save, post) | Replace button label with spinner; disable clicks |
| **Top progress bar** | Route navigation (any duration) | Thin green bar slides in at the top of the viewport |
| **Page skeleton** | Route transitions ≥300ms | Skeleton layout matching the destination's shape, served via Next.js `loading.tsx` |

### Specific surfaces to address

- Bottom-nav taps → top progress bar fires immediately
- Profile / scorecard / accolade list rows → press state + progress bar on tap
- "Are You In?" RSVP buttons → in-button spinner
- All admin save buttons → in-button spinner + disabled state
- Slow data tables (Financials Grid, Analytics) → skeleton rows for the table's known shape

## Technical Plan

### 1. Top-of-page progress bar (router-level)

Add a small client component that subscribes to navigation events and shows a 2px green bar pinned to `top-0`.

- **Where**: `src/components/RouteProgress.tsx`, mounted once in `(app)/layout.tsx`, `(admin)/layout.tsx`, and `(public)/layout.tsx`.
- **Mechanism**: hook into Next.js `usePathname` / `useSearchParams` and the `link` click event. Show the bar on click; hide it on the next paint after the new route renders.
- **No third-party**: implement in ~50 lines so we don't add a dep just for this.

### 2. Route-level skeletons (Next.js `loading.tsx`)

Next.js automatically renders `loading.tsx` while a server component suspends. Add `loading.tsx` to:

- `src/app/(app)/loozers/[userId]/loading.tsx` — skeleton header card + accordion shells
- `src/app/(app)/loozers/loading.tsx` — grid of avatar placeholders
- `src/app/(admin)/admin/financials/grid/loading.tsx` — table-shaped skeleton
- `src/app/(admin)/admin/analytics/loading.tsx` — KPI skeleton + accordion shells
- `src/app/(admin)/admin/users/[userId]/loading.tsx` — tab skeleton

Two reusable building blocks:
- `<Skeleton />` — gray pulsing block with size props
- `<SkeletonRow />` — common table-row shape

### 3. Standardized `<LoadingButton>` for async actions

A drop-in replacement for raw `<button>` that takes `loading` and `loadingLabel` props. When `loading` is true:
- Replaces children with a spinner + (optional) loading label
- Disables itself
- Suppresses pointer events

Roll this out incrementally. Start with the highest-traffic surfaces:
1. RSVP modal
2. Score-save in `LiveScorer`
3. Admin user save / delete
4. RSVP-likelihood toggle
5. Chat send

### 4. `useTransition` for inline state changes

Several buttons trigger client-only state updates (filter tabs, sort toggles) where the UI is briefly heavy. Wrap the state update in React's `useTransition` so the button can show `isPending` immediately.

### 5. Click-acknowledge utility for `<Link>`

Wrap `<Link>` with a thin component that:
- Adds `active:scale-[0.98]` and `active:opacity-80`
- Triggers the top progress bar on click
- Optionally takes a `prefetch={false}` opt-out

Replace common `<Link>` usages in the bottom nav, list rows, and admin section grids.

## Edge Cases

- **Fast routes (cached by Next.js prefetch)**: progress bar would flash. Show the bar only after a 100ms delay so cached navigations stay snappy.
- **Failed async actions**: button must reset `loading=false` and surface the error. The `<LoadingButton>` API should accept either a sync or async `onClick`; we await it and reset on success/error/throw.
- **Slow network**: keep the progress bar visible until the new route paints, even if it takes 5s+. No timeout.
- **Disabled-by-default buttons** (e.g., Save with no changes): `loading` state must not override the disabled state.
- **Multiple concurrent actions**: the top progress bar should reflect "any nav in flight" — if a second nav starts, keep the bar; only hide when the last in-flight nav completes.
- **Server actions / form submits**: `useFormStatus` already provides `pending`. Use it for `<form>`s instead of `useState`.

## Acceptance Criteria

- [ ] Top progress bar appears on every route change within 100ms (after the 100ms cached-route delay) and disappears once the destination paints.
- [ ] At least 5 high-traffic routes have a `loading.tsx` with a route-shaped skeleton.
- [ ] `<LoadingButton>` exists in `src/components/ui/`, has `loading`/`loadingLabel` props, and is used in: RSVP form, LiveScorer save, admin user save, chat send.
- [ ] No async button can be double-fired (clicks suppressed while loading).
- [ ] All bottom-nav tabs and list-row links use the click-acknowledge wrapper.
- [ ] No regression: existing `active:` press states still fire.
- [ ] Performance: the new top progress bar adds <1KB gzipped to the client bundle.

## Out of Scope (separate issue)

- Server-side performance audit (the underlying "why is this slow?" question). Loading states *mask* slowness — they don't cure it. Both are worth doing; this issue covers only the UX masking layer.
- Optimistic updates (e.g., showing the new RSVP value before the API confirms). Worth its own design pass once the basic loading patterns land.
- Skeleton parity with every page in the app — diminishing returns past the top routes.

## Roll-out

Three PRs:
1. **Foundation**: `<Skeleton>`, `<LoadingButton>`, `<RouteProgress>`. No surface changes — just the building blocks.
2. **Route skeletons + progress bar wiring**: drop `loading.tsx` files in for the top 5 routes, mount `<RouteProgress>` in the three layouts.
3. **Migrate buttons**: replace raw `<button>`s with `<LoadingButton>` in the high-traffic forms.
