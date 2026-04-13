# Feature: Duplicate Event

## Overview

Each year, Golfapalooza follows roughly the same format — same contests, same option structure, same schedule template, same rules in the notebook. Currently, setting up a new year means recreating everything from scratch. This feature adds a "Duplicate Event" button that clones an existing event's structure into a new one, updating only the things that change (dates, year), so the admin can be up and running in minutes instead of hours.

## The Challenge

An "event" in Golfapalooza isn't just one table — it's a web of 20+ interconnected tables. Some of that data is **structural** (contest definitions, option groups, schedule templates, rules) and should be copied. Other data is **per-year** (scores, selections, payments, team assignments) and should start fresh. The tricky part is that many of these tables cross-reference each other with UUIDs, so copying them requires careful ID remapping.

## What Gets Duplicated vs. Left Empty

### Duplicated (structural/config data)

| Table | What's Copied | Remapping Needed |
|-------|--------------|------------------|
| `trip_settings` | Name, location, hotel, course, timezone, visibility toggles | New ID, new year, new dates |
| `event_days` | Day names (e.g., "Scramble Day 1") | New trip_id, recalculate dates from new start_date |
| `contests` | Names, types, day_numbers, sort_order | New IDs, new trip_id. Old→new contest ID map is critical. |
| `ryder_cup_teams` | Team names/colors (2 per KGB Cup contest) | New contest_id references |
| `option_groups` | Group names, descriptions, sort_order | New IDs, new trip_id |
| `trip_options` | Option names, types, costs, choices JSONB | New IDs, new group_id refs, remap `linked_contest_id` and `choices[].contest_id` |
| `trip_option_settings` | Deadline structure, is_open | New trip_id, clear/reset deadline |
| `itinerary_items` | Schedule items (meals, activities, tee times) | New trip_id, shift day references |
| `trip_facilities` | Which facilities are linked | New trip_id, same facility_ids |
| `notebook_categories` | Category names, sort_order | New IDs, new trip_id |
| `notebook_notes` | Rules, course info, FAQs, pinned_to slugs | New IDs, new category_id refs, new trip_id |
| `action_items` | Pre-event tasks (RSVP, pay fees, etc.) | New trip_id |
| `pickem_settings` | Entry fee, payout structure | New contest_id ref |
| `tee_times` | Time slots and starting holes per day | New trip_id (but clear scramble_team_id) |
| `accolades` | Award categories | New trip_id |

### Left Empty (per-year data)

| Table | Why |
|-------|-----|
| `event_participants` | Players RSVP fresh each year |
| `contest_participants` | Enrollment happens via options |
| `scramble_team_members` | Teams are drafted each year |
| `scramble_scores`, `scramble_bonus_points` | Contest results |
| `ryder_cup_pairs`, `ryder_cup_foursomes` | Match setup is per-year |
| `kgb_cup_hole_scores`, `kgb_cup_player_handicaps`, `kgb_cup_pair_handicaps` | Contest results |
| `cornhole_scores` | Contest results |
| `daily_contest_winners`, `hundred_feet_scores` | Contest results |
| `pickem_games` | Game slate changes each year (different CFB week) |
| `pickem_picks`, `pickem_payments` | User selections |
| `calcutta_bids`, `calcutta_winners` | Auction results |
| `user_option_selections` | Fresh selections each year |
| `financial_transactions` | Ledger entries (lifetime balances carry over independently) |
| `user_action_completions` | Task progress |
| `room_assignments` | Room assignments change |
| `tee_time_players` | Player assignments |
| `chat_rooms` (event-specific) | New chat room auto-created |
| `gallery_items`, `gallery_reactions`, etc. | User-generated content |
| `scheduled_announcements` | Event-specific notifications |
| `user_scramble_stats` | Per-event admin-entered stats |

## The ID Remapping Problem

This is the hardest part. When duplicating, new UUIDs are generated for every copied row. Tables that reference each other need their foreign keys updated to point to the new IDs.

**Dependency chain:**
```
trip_settings (new ID)
  ├── event_days (new trip_id)
  ├── contests (new trip_id, generates old→new contest ID map)
  │     ├── ryder_cup_teams (new contest_id)
  │     └── pickem_settings (new contest_id)
  ├── option_groups (new trip_id, generates old→new group ID map)
  │     └── trip_options (new group_id, remap linked_contest_id, remap choices JSONB contest_ids)
  ├── trip_option_settings (new trip_id)
  ├── itinerary_items (new trip_id)
  ├── trip_facilities (new trip_id)
  ├── notebook_categories (new trip_id, generates old→new category ID map)
  │     └── notebook_notes (new category_id, new trip_id)
  ├── action_items (new trip_id)
  ├── tee_times (new trip_id, clear scramble_team_id)
  └── accolades (new trip_id)
```

**Special case — JSONB remapping:**
`trip_options.choices` contains embedded `contest_id` values that aren't enforced by foreign keys. These must be parsed, remapped using the old→new contest ID map, and written back:
```json
// Before (old contest UUID)
[{"label": "KGB Cup", "cost": 65, "contest_id": "old-uuid-here"}]
// After (new contest UUID)
[{"label": "KGB Cup", "cost": 65, "contest_id": "new-uuid-here"}]
```

## Technical Implementation Plan

### API Endpoint

`POST /api/admin/trips/duplicate`

**Request body:**
```json
{
  "source_trip_id": "uuid-of-event-to-clone",
  "trip_name": "Golfapalooza",
  "trip_year": 2027,
  "start_date": "2027-09-01",
  "status": "active"
}
```

**Implementation (single server-side transaction):**

1. Create new `trip_settings` row (copy fields from source, override name/year/dates/status)
2. Copy `event_days` — regenerate dates based on new start_date, keep day names
3. Copy `contests` — build `contestMap: Record<oldId, newId>`
4. Copy `ryder_cup_teams` — remap contest_id via contestMap
5. Copy `option_groups` — build `groupMap: Record<oldId, newId>`
6. Copy `trip_options` — remap group_id via groupMap, remap linked_contest_id and choices JSONB via contestMap
7. Copy `trip_option_settings`
8. Copy `pickem_settings` — remap contest_id via contestMap
9. Copy `itinerary_items`
10. Copy `trip_facilities`
11. Copy `notebook_categories` — build `categoryMap: Record<oldId, newId>`
12. Copy `notebook_notes` — remap category_id via categoryMap
13. Copy `action_items`
14. Copy `tee_times` — clear scramble_team_id
15. Copy `accolades`
16. If `status: "active"`, archive the currently active event
17. Auto-create event chat room (reuse existing logic from migration 00042)

All inserts should use the admin client (service role) to bypass RLS.

### Admin UI

**Location:** Admin events list page (`/admin`)

Add a "Duplicate" button on each event card (especially archived ones). Clicking it opens a modal/form with:
- Pre-filled event name (from source)
- Year field (auto-incremented)
- Start date picker
- "Create as active event" toggle (default: true)
- Confirmation button: "Duplicate Event"

On success, navigate to the new event's admin page.

### Edge Cases

- **Same course:** If the source event's course still exists, link it. If not, leave course_id null.
- **Facilities:** Copy trip_facilities links. If a facility was deleted, skip it gracefully.
- **Dates:** Itinerary items reference day_number, not absolute dates, so they port cleanly.
- **Option deadlines:** Reset `trip_option_settings.selection_deadline` to null (admin sets new deadline).
- **Tee times:** Copy time slots and starting holes but clear `scramble_team_id` since teams don't exist yet.
- **Notebook pinned_to:** Copy as-is since slugs are page-based, not ID-based.
- **Pick'em games:** Do NOT copy (CFB schedule changes yearly). Only copy `pickem_settings` (entry fee, payout structure).

## Acceptance Criteria

- [ ] Admin can duplicate any event (active or archived) with one click + minimal config
- [ ] All structural data listed above is copied with correct ID remapping
- [ ] No per-year data (scores, selections, payments, participants) is copied
- [ ] JSONB contest_id references in trip_options.choices are correctly remapped
- [ ] linked_contest_id on trip_options is correctly remapped
- [ ] New event can optionally become the active event (archiving the current one)
- [ ] Event chat room is auto-created for the new event
- [ ] trip_option_settings deadline is reset (not carried from source)
- [ ] Tee time slots are copied but player assignments and team links are cleared
- [ ] Admin is navigated to the new event's admin page on success
- [ ] Error handling: if any step fails, the entire operation rolls back cleanly
