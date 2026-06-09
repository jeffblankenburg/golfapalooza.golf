# Per-user font scale preference ("Make the text bigger")

## Problem

Several Loozers — particularly the older crowd — have asked for a way to make the app's text bigger. iOS Dynamic Type and Android's system font scale are the obvious lever, but neither is automatically applied to web/PWA text in CSS pixel/rem units. The browser doesn't expose the OS preference to JS or CSS in any usable way; only the iOS-specific `font: -apple-system-body` keyword honors Dynamic Type, and adopting it would replace our entire typography system with a single iOS-only font primitive.

The right answer is an in-app preference the user controls explicitly. The Loozer audience isn't going to discover browser-level zoom; "where's the setting to make text bigger" is the supportable path.

## Goal

A per-user font scale preference, surfaced as one setting in the profile menu, that scales all text in the app proportionally without breaking layout. Persists across sessions and devices for the same user.

## Approach

### 1. Storage

Add a `font_scale` column to `users`:

```sql
ALTER TABLE users
  ADD COLUMN font_scale TEXT NOT NULL DEFAULT 'default'
    CHECK (font_scale IN ('default', 'large', 'xlarge'));
```

Three sizes is enough — `default` (100%), `large` (115%), `xlarge` (130%). Fewer choices = less testing surface; the bracket from 100% to 130% covers the "I can read it now" range without breaking layouts.

(Text enum rather than numeric multiplier so future named tiers — `small`, `xxlarge` — don't require a migration.)

### 2. Application

The scale lives as a CSS custom property on `<html>`, applied server-side from the authenticated user's profile in `src/app/(app)/layout.tsx`:

```tsx
<html style={{ fontSize: scaleToPercent(profile.font_scale) }}>
```

`scaleToPercent` returns `100%` / `115%` / `130%`. Everything downstream sized in `rem` (Tailwind's defaults) scales automatically.

For server components, read `users.font_scale` in the same `Promise.all` that already fetches profile + notifications + memberships in `(app)/layout.tsx` — no extra round trip.

For the public/auth pages (login, spectator), no scaling applied — default 16px root.

### 3. UI

One section in the profile drawer / settings:

> **Text size**
> ( ) Default  ( ) Large  ( ) Extra Large
>
> Preview: "If you EVER feel like something isn't working the way you think it should, you're probably right. Just text Quack."

A real preview block in the live scale helps the user pick. Saving fires a `PATCH /api/profile` and reloads the page to apply (or pushes the CSS variable via `document.documentElement.style.fontSize` for instant-apply with no flicker).

### 4. The typography sweep (the bulk of the work)

Tailwind's default text utilities (`text-xs`, `text-sm`, `text-base`, `text-lg`, etc.) are all `rem`-based and will scale automatically. The pain points are the bracket-arbitrary `px` sizes scattered through the codebase, particularly in chat (`text-[11px]`, `text-[15px]`, `text-[17px]`), live scoring, and a few admin views.

Sweep plan:
- Grep `text-\[\d+px\]` across `src/` and convert to the closest Tailwind named size, or to `text-[Nrem]` if no named size fits.
- Same for any inline `style={{ fontSize: '\dpx' }}` usages.
- Same for `font-size:` in `globals.css` if any are pixel-valued (audit `globals.css`).
- Hit targets (`w-12 h-12`, etc.) and layout spacing (`gap-`, `px-`, `py-`) stay in their current units — we're scaling *text*, not the whole UI. Otherwise iMessage-style bubbles and bottom nav break at 130%.

### 5. Layout reflow checks

At 130%, longer text will wrap more aggressively. The places most at risk:
- Bottom nav labels (`text-[9px]` — already tiny, will be ~12px at 130%; check truncation).
- Chat message bubbles (multi-line wrap is the design intent — should still look right).
- Round summary cards / handicap dashboard rows.
- Admin tables — these are already cramped at default; verify horizontal scroll behavior.

Test on the smallest supported viewport (iPhone SE 375px wide).

## Out of scope

- OS-level Dynamic Type / Android font scale auto-detection. Not a real capability in web — skip.
- Per-page or per-component overrides. One global setting.
- Independent control of UI scale vs text scale. Text only.
- A `small` tier. Default is already small enough; adding more knobs has diminishing returns.
- High-contrast / color preferences. Separate accessibility feature.

## Acceptance criteria

- [ ] Migration adds `users.font_scale` with the three-value CHECK constraint and `default` default.
- [ ] `(app)/layout.tsx` reads the user's `font_scale` and applies it to `<html>` (or `<body>`) as a `font-size: %` style.
- [ ] Profile / settings page has a "Text size" picker with a live preview, persists to `users.font_scale`, and applies the new scale without a hard reload.
- [ ] Audit: zero `text-\[\d+px\]` or inline `fontSize: '\d+px'` remain in `src/components` and `src/app/(app)` after the sweep (or each surviving one has a comment explaining why it must stay fixed — e.g., a logo).
- [ ] At `xlarge`, no broken layouts on iPhone SE width (375px): bottom nav labels visible, chat input not clipped, round cards readable.
- [ ] Spectator and auth pages render at default scale regardless of any signed-in preference (they don't have a session to read from anyway).
- [ ] Setting persists across devices for the same user — log in on a second device, scale follows.
