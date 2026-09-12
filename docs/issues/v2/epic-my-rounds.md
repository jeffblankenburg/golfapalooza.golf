**The single largest deferred area.** Port the personal-rounds subsystem into v2
(the "You" bucket). The top-bar "Rounds" button is currently a stub drawer.

## Scope
- [ ] My Rounds — round history + stats
- [ ] Live Scoring entry (individual) + realtime sync
- [ ] Scramble scoring entry
- [ ] USGA handicap calculation (best 8 of 20, net double bogey, 9/18 round types)
- [ ] Guests (non-account players), incomplete-round handling
- [ ] Financials (personal buy-ins & payouts — "You" bucket, event-scoped)

Large enough to split into child issues once scoped. Reuse the original's
`/api` round pipeline + handicap libs as reference (v2 owns copies).

_Deferred from the v2 build._
