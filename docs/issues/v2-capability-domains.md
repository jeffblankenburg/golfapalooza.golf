# v2: capability domains (golf vs general vs sports) + close the golf leaks

## Problem

v2 is a multi-tenant "group in a box," but it began as a golf app and golf is still **hardwired**: a brand-new non-golf group immediately sees golf surfaces it can't turn off. There's no concept of "is this even a golf group." Admins should be able to run a book club, a fantasy league, or a neighborhood association on this platform without golf littered through it.

The feature-toggle system already exists and is good — `src/lib/v2/features.ts` (the `FEATURE_CATALOG`), per-org/per-event rows in `v2_event_features` (visibility `off`/`everyone`/`admins` + schedule window), the admin editor `FeaturesConfig.tsx`, and gate helpers (`isFeatureVisible`, `isFeatureActive`, `resolveFeatures`). The gaps are (1) some golf capabilities bypass it entirely (hardcoded), (2) there's no way to default a whole class of features off for a non-golf group, and (3) some golf-ness isn't a "feature" at all (profile fields, terminology).

Related: **#220** ("close forced capability leaks") tracks a handful of specific always-on leaks. This epic is the broader framework #220's items slot into.

## Decision (confirmed with product)

Use a **capability-domain** model, not a binary golf switch and not a creation-only "group type":

- Tag every feature with a `domain`: **`general`** | **`golf`** | **`sports`**.
- A per-group **enabled-domains** setting (golf on/off, sports on/off) drives default visibility and also gates the non-feature golf bits (profile fields, terminology). A group "type" chosen at creation is just a preset that sets these.
- Per-feature toggles still work on top of the domain default — a golf group can still hide an individual golf feature, and a general group could opt a single golf feature back on.

Three domains, not two, because sports/betting prediction games (Pick'em, Squares, Props, Auction, Cornhole) aren't golf-specific — a non-golf group might well want them.

## Classification (from the audit)

**General** (any group — always offerable): Chat, Photos, Music, Members, Birthdays, Announcements, Articles, Polls, Notebook, Schedule, Options, My Balance, My Money, Financials, Rooms, Trip Info, Action Items, Add a Rookie, Profile (alwaysOn).

**Golf** (gate behind the golf domain): My Rounds, Live Scoring, Scramble, Skins, 100 Feet, Daily Games, KGB Cup, BSPITW, Boland Bet, Calcutta, Courses, Shirt Guide, Best Line, Accolades — plus the sub-capabilities handicap, tee times, scorecards, and the **golf profile fields** (Playing since, Swings, Typical shot, Best shot, "Show me on the Loozer map").

**Sports / prediction** (gate behind the sports domain): Pick'em, Squares, Props, Auction, Cornhole.

**Non-feature golf leaks** (not in the registry, need their own gating): the golf **profile fields** in `ProfileDrawer.tsx`; residual hardcoded "Loozer" terminology that bypasses `member_noun`; the always-rendered home **contest cards** (Squares/Pick'em/Auction/Props in `HomeModules.tsx`) — currently soft-gated only by whether a contest exists.

## Phases

### Phase 1 — Fix My Rounds (DONE)
My Rounds was `status: "planned"` (so absent from the admin editor) *and* hardcoded in `EventShell.tsx` (top-bar icon + drawer, not gated like Chat/Photos/Music). Fixed: flipped to `status: "available"`, `defaultEnabled: true`, `topbar: true`, `surface: "drawer"`; added a `roundsEnabled` gate through `layout.tsx` → `EventShell.tsx` (icon + both drawer open-paths). It's now a default-on toggle in the Features editor. Files: `src/lib/v2/features.ts`, `(event)/layout.tsx`, `(event)/EventShell.tsx`.

### Phase 2 — Domain tagging + wire the strays
- Add `domain: "general" | "golf" | "sports"` to `FeatureDef` and set it on every catalog entry per the classification above.
- Wire the remaining hardcoded/planned golf capabilities into the registry as real features so they're all togglable in one place (surface the ones already built; keep genuinely-unbuilt ones `planned`).
- No behavior change yet — tagging + registry hygiene.

### Phase 3 — The domain switch + defaults
- Per-org enabled domains (e.g. `v2_organizations.enabled_domains` or boolean columns `golf_enabled` / `sports_enabled`), editable in Settings; a group-type preset at creation sets them (golf group → golf on; general group → golf off).
- `resolveFeatures` / `isFeatureVisible` respect the domain: a feature whose domain is disabled defaults to hidden (admin can still override per-feature).
- Gate the **golf profile fields** and any residual golf terminology on the golf domain; make member terminology fully `member_noun`-driven (sweep hardcodes).

### Phase 4 — Admin + home polish
- Gate the home contest cards (`HomeModules.tsx`) and the admin "Add contest" / "Add competition" menus by domain, so a non-golf group's admin UI isn't littered with golf either.
- Fold in #220's remaining TODOs (auto_enroll/scoring_source toggles, managed-channel opt-out, calendar banner toggle) where they fit the domain model.

## Acceptance

- [x] My Rounds can be turned off for a group (Phase 1).
- [ ] Every catalog feature carries a `domain`; the classification above is encoded.
- [ ] A group can enable/disable the golf and sports domains; a new general group sees no golf by default (no My Rounds, no golf profile fields, no golf terminology, no golf contest cards/menus).
- [ ] Per-feature overrides still work regardless of domain default.
- [ ] #220's remaining leaks are either resolved here or consciously documented.

## Key files
`src/lib/v2/features.ts`, `src/lib/v2/features-server.ts`, `src/app/new/_components/FeaturesConfig.tsx`, `src/app/new/[slug]/(event)/layout.tsx` + `EventShell.tsx`, `ProfileDrawer.tsx`, `HomeModules.tsx`, `v2_organizations` (+ a migration for the domain columns), `v2_event_features`.
