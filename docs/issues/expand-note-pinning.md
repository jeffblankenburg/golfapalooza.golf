## Overview

The notebook system (see issue #81) lets admins pin info-button notes to specific pages. Today only a handful of pages support pin targets. Expand coverage so organizers can attach context notes to many more surfaces (rules, reminders, past controversies, "read this before you enter scores").

## User Experience

### Current state

- Admin can pin notes to pages like `cornhole`, a handful of other contexts via `pinnedTo` prop on `PinnedNoteButton`
- User sees an info button (ⓘ) next to a page title; tap → read the note(s)

### Desired expansion

Pages/targets to add (non-exhaustive — to be finalized with organizers):

- Each individual contest detail page (KGB Cup, Calcutta, skins, 100 Feet, BSPITW, Whitey's Pick'em)
- Scoring entry pages (scramble, live scoring, scorecard)
- Room assignments page
- Tee times page
- Photo gallery landing
- Financial/payments page
- Best Line submission page
- Nominations page
- Course map / map view

### Behavior (unchanged)

- Admins with `manage_notebook` permission can pin
- Users with normal access can read
- Pin targets are discoverable — admin picker lists every supported target

## Technical Notes

- Each new target is just a new `pinnedTo="<slug>"` placement in the corresponding page component plus a slug registered in the notebook admin picker
- No schema changes expected
- Audit `PinnedNoteButton` placement sites and add missing ones
- Ensure slugs are stable/descriptive; namespace them (e.g., `contest:100-feet`, `page:tee-times`)

## Acceptance Criteria

- [ ] Every major user-facing page supports a pinned note
- [ ] Admin note-picker UI shows the full list of supported pin targets
- [ ] No regressions on existing pin targets (cornhole etc.)
- [ ] Empty state: when no note is pinned, the ⓘ button does not render (existing behavior preserved)
