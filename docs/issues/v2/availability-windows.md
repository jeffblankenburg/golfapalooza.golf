The registry schema + resolver already support time-gated availability
(`availability='window'`, `available_from`/`available_until`) and the launcher
renders "Opens Mar 3" / "Closed" lock states — but there is **no admin UI** to
set the window, so it's currently inert.

## Scope
- Add availability (Always / Window with from-until dates) controls to the Group/Event Features config screens.
- Persist via the existing features API fields.

## Acceptance
- An admin can schedule a feature to open/close at set times; the launcher + gating reflect it.

_Deferred; plumbing exists, no UI._
