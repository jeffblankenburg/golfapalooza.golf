## Overview

Send push notifications to players reminding them of their tee time before their round. All the pieces exist — tee time assignments, push notification tokens, and the notification infrastructure — they just need to be wired together.

## How It Works

When an admin publishes tee times (or when the app detects tee times exist for the current day), players should receive a push notification a configurable number of minutes before their tee time.

## Implementation

### Trigger Options

**Option A: Cron-based (recommended)**
- A scheduled function runs every 5 minutes during event days
- Queries for tee times happening in the next X minutes (e.g., 30 minutes)
- Cross-references with `push_subscriptions` to find players with push tokens
- Sends notifications to players who haven't already been notified
- Track sent notifications in a `tee_time_notifications_sent` table to avoid duplicates

**Option B: Admin-triggered**
- Admin clicks "Send Tee Time Reminders" button
- Sends push notifications to all players with tee times for the current day
- Simpler but less automatic

### Notification Content

```
Title: "Tee Time in 30 Minutes"
Body: "You're up at 9:30 AM on Hole 1 with Quack, Spanky, and Moose"
Action: Opens /scoring or /kgb-cup/scoring depending on contest type
```

Include:
- Tee time
- Starting hole
- Teammate names
- Day label (e.g., "Day 2 — Thursday")

### Data Sources

- **Tee times**: `tee_times` + `tee_time_players` (individual tee times) and `tee_times` + `scramble_teams` (team tee times)
- **Push tokens**: `push_subscriptions` table
- **Notification sending**: existing `/api/notifications/send` infrastructure
- **Simulated date**: respect the simulator for testing

### Configuration

- Add `tee_time_reminder_minutes` to `trip_settings` (default: 30)
- Admin can adjust on the event settings page

## Acceptance Criteria

- [ ] Players receive a push notification before their tee time
- [ ] Notification includes time, starting hole, and teammates
- [ ] Notifications are not sent twice for the same tee time
- [ ] Works for both scramble team tee times and individual (KGB Cup) tee times
- [ ] Reminder timing is configurable by admin
