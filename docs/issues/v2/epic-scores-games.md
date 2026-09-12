Port the **Scores & Games** contest features into the v2 `/new` app. Each is
catalogued (`status:'planned'`) in `src/lib/v2/features.ts`; shipping one means
building its data/API/UI, adding a `FEATURE_ROUTES` entry, and flipping its
catalog status to `available`. These are highly tenant-variable (driven by which
contests a group runs).

## Features
- [ ] Live Scoring (hole-by-hole, realtime)
- [ ] Scramble (team scoring + leaderboard)
- [ ] Skins
- [ ] 100 Feet
- [ ] Daily Games
- [ ] KGB Cup (Ryder-Cup-style)
- [ ] Calcutta (auction + payouts)
- [ ] Cornhole (bracket)
- [ ] Boland Bet
- [ ] BSPITW
- [ ] Pick'em

_Deferred from the v2 build; mostly event-scoped._
