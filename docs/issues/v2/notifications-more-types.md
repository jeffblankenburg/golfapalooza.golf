v2 per-type notification preferences (`src/lib/v2/notification-prefs.ts`) only
cover **Chat** (message/mention) and **Photos** (tag/comment). Every other
producer rides the master push toggle with no granular control.

## Scope
- Add notification sections/types for the other producers as they ship: round invites, polls, articles, announcements, RSVP nudges.
- Keep the resolver (`resolveNotificationRecipients`) and the settings modal in sync.

## Acceptance
- Each notification-producing feature has a per-type toggle grouped under a section.

_Deferred; only chat + photos have granular prefs today._
