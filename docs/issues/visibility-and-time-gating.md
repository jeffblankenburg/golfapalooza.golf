## Overview

Overhaul the event visibility system to combine **automatic time-gating** with **admin override toggles**. Many features should only appear to users at the right time (e.g., live scoring 1 hour before tee time, scorecards after rounds are played), but the admin should be able to force any feature visible for demos, testing, or troubleshooting.

## Problem

The current visibility system has three simple toggles (`show_tee_times`, `show_teams`, `show_rooms`) that were added early and may not be actively used. Time-gating was previously implemented for scoring cards but was removed ("Time gates removed — scoring links show whenever data exists") to simplify things. This means:

- **Score Your Round** cards show on the home page as soon as teams and tee times exist — days or weeks before the event
- **Score KGB Cup** card shows whenever scoring is open, regardless of whether it's the right day/time
- **Scorecards, Skins, 100 Feet, Daily Games** pages are always accessible in the quick links, even before the event starts
- **Room assignments** are gated by a toggle but could be time-based instead
- There's no way to preview what a user will see at a specific point in the trip without using the date simulator

## Proposed Design

### Two-Layer Visibility: Auto + Override

Each time-gated feature has:
1. **Auto rule** — the default behavior based on time/data (e.g., "show 1 hour before tee time")
2. **Admin override** — a toggle that forces visibility ON regardless of the auto rule

The admin Visibility panel shows each feature with its current auto-status and an override switch. When the override is OFF, the auto rule governs. When ON, the feature is always visible.

### Features to Gate

| Feature | Auto Rule | Home Page Card | Quick Link |
|---------|-----------|----------------|------------|
| **Score Your Round** | Show 1 hour before the player's tee time on that contest day | Hide card until window opens | N/A (no quick link) |
| **Score KGB Cup** | Show 1 hour before the player's KGB Cup tee time | Hide card until window opens | N/A |
| **Tee Times** | Show from 1 day before the trip start date | Hide tee time card | Show quick link |
| **Scorecards** | Show from trip start date onward | N/A | Show quick link |
| **Skins** | Show from trip start date onward (only if a scramble contest exists) | N/A | Show quick link |
| **100 Feet** | Show from trip start date onward (only if a scramble contest exists) | N/A | Show quick link |
| **Daily Games** | Show from trip start date onward (only if a scramble contest exists) | N/A | Show quick link |
| **BSPITW** | Show from trip start date onward | N/A | N/A (not in quick links) |
| **Room Assignments** | Show from 1 week before trip start date | N/A | Show quick link |
| **Calcutta** | Already gated by `calcutta_active_order` — keep as-is | N/A | Show quick link |
| **Pick'em** | Already has 3-hour urgent window — keep as-is | N/A | Show quick link |
| **Team compositions** | Show from trip start date (or when admin decides) | N/A | Affects contest detail views |
| **Options deadline** | Already time-gated by deadline date — keep as-is | N/A | N/A |

### What Stays Always Visible

These features should always be accessible regardless of time:
- Chat, Gallery, Music, Articles, Notebook, My Rounds, Nominations
- Profile, Info, Schedule, Financials, Action Items, Course
- Contest list (but team details within may be gated)

## Database Changes

Replace the three boolean columns with a single JSONB column for flexibility:

```sql
ALTER TABLE public.trip_settings
  ADD COLUMN IF NOT EXISTS visibility_overrides JSONB NOT NULL DEFAULT '{}';
```

The JSONB stores which features have admin overrides enabled:
```json
{
  "scoring": true,
  "tee_times": true,
  "scorecards": false,
  "rooms": true
}
```

Missing keys or `false` values mean "use the auto rule." `true` means "force visible."

Keep the existing `show_tee_times`, `show_teams`, `show_rooms` columns for backward compatibility during migration, then deprecate.

## Admin Visibility Panel

Replace the current three toggles with a comprehensive panel:

```
┌─────────────────────────────────────────────┐
│ Visibility                                  │
│ Control what Loozers can see                │
├─────────────────────────────────────────────┤
│                                             │
│ Live Scoring        Auto: Hidden    [Force] │
│   Shows 1hr before tee time                 │
│                                             │
│ Tee Times           Auto: Hidden    [Force] │
│   Shows 1 day before trip                   │
│                                             │
│ Scorecards          Auto: Hidden    [Force] │
│   Shows on trip start date                  │
│                                             │
│ Skins               Auto: Hidden    [Force] │
│   Shows on trip start date                  │
│                                             │
│ 100 Feet            Auto: Hidden    [Force] │
│   Shows on trip start date                  │
│                                             │
│ Daily Games         Auto: Hidden    [Force] │
│   Shows on trip start date                  │
│                                             │
│ Room Assignments    Auto: Hidden    [Force] │
│   Shows 1 week before trip                  │
│                                             │
│ Team Compositions   Auto: Hidden    [Force] │
│   Shows on trip start date                  │
│                                             │
└─────────────────────────────────────────────┘
```

Each row shows:
- Feature name
- Current auto status (Visible/Hidden based on the time rule)
- "Force" toggle to override

## Implementation

### Server-Side Visibility Helper

Create `src/lib/visibility.ts`:

```typescript
export function isFeatureVisible(
  feature: string,
  trip: { start_date: string; visibility_overrides: Record<string, boolean> },
  options?: { teeTime?: string; dayNumber?: number; now?: Date }
): boolean {
  // Check admin override first
  if (trip.visibility_overrides[feature]) return true;

  // Apply auto rules
  const now = options?.now || new Date();
  const tripStart = new Date(trip.start_date);
  // ... time-based logic per feature
}
```

### Where to Apply

1. **Home page** (`src/app/(app)/page.tsx`) — gate the scoring cards, tee time card
2. **HomeContent** (`src/components/HomeContent.tsx`) — filter quick links based on visibility
3. **Individual pages** (`scorecards`, `skins`, `hundred-feet`, `daily-games`, `rooms`) — show "Coming soon" or redirect if not yet visible
4. **Contest detail** (`ContestList.tsx`) — gate team compositions

### Simulator Integration

The visibility system should respect the simulated date (`getEffectiveDate()`) so admins can preview what users will see at any point during the trip.

## Acceptance Criteria

- [ ] Live scoring cards only appear on the home page within 1 hour of the player's tee time (or when forced)
- [ ] Scorecards, Skins, 100 Feet, Daily Games quick links are hidden before the trip starts (or when forced)
- [ ] Room assignments are hidden until 1 week before the trip (or when forced)
- [ ] Team compositions are hidden until the trip starts (or when forced)
- [ ] Admin Visibility panel shows auto status and override toggle for each feature
- [ ] Overrides take effect immediately when toggled
- [ ] Simulator date is respected for auto rules
- [ ] Features that are hidden show a friendly "Coming soon" message if a user navigates directly to the URL
- [ ] Existing features that are already correctly gated (Calcutta, Pick'em, Options) are unaffected
