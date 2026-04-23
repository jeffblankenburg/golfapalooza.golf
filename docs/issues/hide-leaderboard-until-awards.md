## Overview

The organizers discussed preserving the surprise factor of the Saturday awards ceremony by hiding final standings (Calcutta, scramble, KGB Cup, contests) until the awards are handed out. Score entry would still function normally — only the public-facing *display* of final results would be gated.

Filed for cataloging — the group has not definitively decided to adopt this. May never be built, but worth having in the backlog.

## User Experience

### Admin control

1. A per-contest (or trip-wide) toggle: "Hide final standings until awards ceremony"
2. Optional scheduled time: "Reveal at {datetime}" so it auto-flips at the banquet

### Non-admin view when hidden

- Leaderboard pages show a placeholder: "Standings will be revealed at the awards ceremony"
- Individual scores are still entered and verified normally
- Admins/organizers can still see full standings in admin views
- On reveal, the page becomes visible to everyone automatically

### What's affected

- Scramble standings, KGB Cup final standings, Calcutta results, daily game winners, potentially contest winners
- NOT affected: live round scoring, score verification, admin views, handicap tracking

## Technical Notes

- Likely reuses the visibility-overrides system (migration 00090) — add a "hidden until" state and a reveal timestamp
- Needs an eligibility check on every affected leaderboard API/page
- Admins bypass the gate via an `is_admin` short-circuit
- Spectator pages respect the gate (since spectators are non-admin)

## Acceptance Criteria

- [ ] Admin can enable "hide until awards" on a trip or per-contest basis
- [ ] Non-admin users see a placeholder instead of standings
- [ ] Admins still see full standings
- [ ] Spectator pages respect the hide state
- [ ] Score entry/verification unaffected
- [ ] Optional: scheduled auto-reveal at a set datetime
- [ ] Reveal is a single toggle (no accidental half-revealed state)
