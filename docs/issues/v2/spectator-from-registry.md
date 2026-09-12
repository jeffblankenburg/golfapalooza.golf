The feature registry stores a per-feature `public` flag (three-state visibility
UI already sets it), but **nothing consumes it** — v2 has no spectator/public
view yet. The IA plan calls for the spectator experience to be re-derived from
this flag so member/public stay in sync.

## Scope
- A public (no-auth) `/new/[slug]` spectator surface that renders only `public` features, read-only, with a "sign in to do more" CTA.
- Reuse the registry resolver; never expose financials/chat/rooms/phone/etc.

## Acceptance
- Toggling a feature `public` in Group/Event Features makes it appear (read-only) on the spectator view; non-public features never leak.

_Deferred; completes the registry story._
