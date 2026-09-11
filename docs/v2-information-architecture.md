# v2 Information Architecture — Recommendation

_A plan for presenting the original site's dozen-plus "quick links" and specialized features in the multi-tenant `/new` app. No code here — this is the recommendation to react to._

## Decisions (locked)

Resolved with the user:
1. **Bottom bar = Home + 3 pinned + Everything + Admin.**
2. **Explicit opt-in per feature** — nothing appears until an admin enables it in the config screen (no auto-enable from data). The registry is the single source of truth for what's on.
3. **"Everything" is a bottom-sheet launcher** (slides up over the current screen), not a dedicated page.
4. **Config is per-event**, defaulting from the org.
5. **Tier-3 label = "Everything."**
6. **Buckets show as visible section headers** in the launcher.

The sections below are written to these decisions.

## The goal

Every group runs their event differently. Golfapalooza has a Calcutta auction, a Ryder Cup, skins, cornhole, pick'em, 28 years of accolades, and inside-joke nicknames. A corporate scramble might want a schedule, a photo gallery, and one leaderboard — nothing else. **The same app has to feel intentional and uncluttered for both.** So the IA can't be a fixed layout; it has to be a *configurable system* with sensible defaults.

## What the original does (and why it doesn't port as-is)

- **One flat grid of ~19 quick-link cards** on the home page is the primary navigation. Header chrome is minimal (chat, gallery, music, bell, profile). There is no persistent event nav.
- **Availability is decided by tangled rules** — contest-type gating + time windows (`isFeatureVisible`) + an explicit hide-list + permissions. A link is either present or silently gone; the user never learns *why* something isn't there.
- **Everything is hard-coded to Golfapalooza's feature set.** A 19-card grid assumes you have 19 features. Most tenants won't.
- **Spectator is a separate, hand-maintained list** of 9 links that must be kept in sync with the member side.

It works for one power-group, but it's a lot to scan, opaque about gating, and not tenant-flexible.

## Recommended model — three nav tiers + a smart home

Think of navigation as three tiers by *frequency + universality*, plus the home page as the dynamic "what matters now" surface.

### Tier 1 — Persistent utilities (top bar) — ALREADY BUILT
Cross-event tools that are identical for every tenant and used constantly: **Chat, Photos, Music, Notifications, Profile.** These stay in the fixed top bar as drawers. They're communication/personal, not event-specific, so they never move and never need per-group config. (Music can be hidden for groups that don't use it — see the registry.)

### Tier 2 — Primary event nav (bottom bar) — admin-configurable, 3 pinned slots
The bottom bar is the group's **chosen priorities**: `Home` + 3 admin-pinned destinations + `Everything` (+ `Admin` gear for admins). This is where a group's identity shows: Golfapalooza might pin **Scores**, **Calcutta**, **Schedule**; a corporate outing might pin just **Schedule** and **Leaderboard**. Everything not pinned still lives in More, so pinning is about emphasis, not availability.

### Tier 3 — "Everything" launcher — the catch-all, replaces the 19-card grid
A **bottom-sheet launcher** (slides up over the current screen) that lists **every enabled feature, grouped under visible section headers** (the five buckets below). This is the home for lower-frequency features and the safety net so nothing is buried. Generated from the feature registry, so it's always complete and never a hand-maintained grid. Each item has an icon, label, and a one-line "what this is"; each bucket has a header.

### The home page — dynamic, ranked "what matters now"
Home is not a launcher grid; it's a **prioritized feed of the moment** (this is already the direction: RSVP, featured article, birthdays, activity feed, ads, store). Extend it to surface **time-sensitive things automatically** so users rarely hunt:
- **Live now** (a round in progress → jump to scoring; auction is live → jump to Calcutta).
- **Needs you** (RSVP open, options deadline approaching, picks close in 3 hours) — the original's pulse/badge behavior, promoted to real home cards.
- **Latest** (new article, new poll, recent activity).
Everything else is one tap away in the bottom bar or More. The home ranks by urgency and recency; the directory guarantees completeness.

## Feature taxonomy (every original feature, bucketed)

These five buckets are how "More" is grouped and how the admin thinks about enabling features:

1. **Scores & Games** — live scoring, Scrambles, Skins, 100 Feet, Daily Games, KGB Cup, Calcutta, Cornhole, Boland Bet, BSPITW, Pick'em. _Highly tenant-variable; driven by which contests a group creates._
2. **Schedule & Logistics** — Schedule, Course(s), Rooms, Trip Info, Shirt Guide, My Options, Action Items.
3. **Community** — Chat, Photos, Music, Notebook, Loozers directory, Add-a-Rookie (nominations). _Chat/Photos/Music are Tier-1; the rest live in Community._
4. **Stories & Recognition** — Articles, Polls, Accolades, Best Line.
5. **You** — Profile, My Rounds, Financials, Action Items. _Personal/account._

The admin config screen presents features in exactly these buckets.

## Multi-tenant configurability — a feature registry

The heart of the recommendation: a **feature registry** — one row per feature **per event** (defaulting from the org) — that the platform reads to build all three nav tiers. Each entry has:

- `enabled` — the admin explicitly turns this on. **Off by default; nothing appears until enabled** (explicit opt-in). Off = absent everywhere, member and spectator.
- `pinned` / `nav_order` — should it sit in the bottom bar (max 3), and where?
- `label_override` — a group can rename ("Loozers" → "Members", "KGB Cup" → "Ryder Cup").
- `public` — is it exposed to spectators (read-only)?
- `availability` — always | time-window (mirrors `isFeatureVisible`) — applies once enabled, to distinguish "on but not yet active."

An **admin config screen** (per event) lists every feature in the five buckets; the admin enables the ones this event uses, pins up to 3 to the bottom bar, and optionally renames/marks-public. A new event starts from the org's defaults, so setup is a quick review rather than a blank slate. To keep opt-in from feeling like busywork, the config screen can **suggest** features that have data ("You created a Calcutta contest — enable Calcutta?") without auto-enabling them.

## Availability: "show with context" beats "silently hide"

The original hides links with no explanation. Recommend three distinct states, chosen by the registry:

- **Not enabled** → truly absent (admin hasn't turned it on). No confusion because it was never presented.
- **Enabled but not yet active** → visible with a clear **locked/coming-soon** state and the reason ("Scoring opens 1 hr before your tee time," "Picks open Thursday"). This turns opaque gating into a feature.
- **Active** → normal.

The key distinction the original blurs: **"we don't do this" vs "not yet."** The registry makes it explicit, so users always understand what they're seeing.

## Spectator = the same IA, read-only

Instead of a separate 9-link list, drive spectator from the **same registry** via the `public` flag. Spectators get the same categorized directory and home, filtered to public features, rendered read-only, with a "sign in to do more" CTA. One source of truth; public/member stay in sync automatically. (Still never expose financials, chat, rooms, phone numbers, etc. — those are `public: false` by default.)

## Where each original feature lands (summary)

| Original | v2 home |
|---|---|
| Chat, Gallery/Photos, Music, Notifications, Profile | **Tier 1** top bar (built) |
| Live Scoring, KGB Cup, Calcutta, Skins, 100 Feet, Daily Games, Cornhole, Boland Bet, BSPITW, Pick'em | **Scores & Games** bucket; the group pins 0–3 to the bottom bar; the rest in Everything. Home surfaces the live one. |
| Schedule, Courses, Rooms, Info, Shirt Guide, My Options, Actions | **Schedule & Logistics** bucket; Schedule is a common bottom-bar pin. |
| Notebook, Loozers, Add-a-Rookie | **Community** bucket in Everything. |
| Articles, Polls, Accolades, Best Line | **Stories & Recognition**; latest article/poll surface on home (article landing page now built). |
| Profile, My Rounds, Financials | **You** bucket / Profile drawer. |
| Store / Spirit Wear | Home module (built; admin toggle + accordion done). |

## Suggested build order

1. **Feature registry (per event) + admin config screen** (explicit enable / pin ≤3 / label / public / availability, with data-based suggestions) — unblocks everything and makes the shell tenant-aware.
2. **The "Everything" launcher** (bottom sheet) rendered from the registry with visible bucket headers and locked/coming-soon states — immediately gives a home for every ported feature.
3. **Bottom-bar wiring** to the registry's 3 pinned items (the shell already has the stub slots).
4. **Port features by bucket, highest-value first** — Schedule & Course (universal, low-complexity) → Scores & Games (the big, variable one) → Stories/Community/You. Each ported feature just registers itself.
5. **Spectator** re-derived from `public` flags once a few features exist.

## Resolved

All five open questions are answered — see **Decisions (locked)** at the top: 3 pinned slots, explicit opt-in (with data-based suggestions), "Everything" bottom-sheet launcher, per-event config defaulting from the org, and visible bucket headers.
