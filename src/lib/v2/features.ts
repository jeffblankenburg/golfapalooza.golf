/**
 * The v2 FEATURE CATALOG and registry resolver.
 *
 * The catalog is the app-side source of truth for *what features exist* (label,
 * bucket, icon, blurb, whether it's built yet). The DB table `v2_event_features`
 * stores *how a group has configured them* (enabled / pinned / renamed / public /
 * availability), scoped per-event and defaulting from the org.
 *
 * Nothing appears until an admin explicitly enables it (locked IA decision), so
 * every non-tier1 feature defaults to `enabled: false`. Tier-1 utilities
 * (Chat/Photos/Music/Notifications/Profile) live permanently in the top bar and
 * are exempt from opt-in — they're marked `tier1` and rendered "always on."
 *
 * Adding a feature = add a catalog entry here. No migration needed (feature_key
 * is validated against this catalog, not a DB enum). Flip a feature's `status`
 * from 'planned' to 'available' when it's actually built and wired.
 *
 * See docs/v2-information-architecture.md.
 */

export type FeatureBucket = "scores" | "schedule" | "community" | "stories" | "you";

/** 'available' = built & wired; 'planned' = catalogued but not yet portable. */
export type FeatureStatus = "available" | "planned";

/** How a feature is reached: a routed page, a top-bar drawer, or an external link. */
export type FeatureSurface = "route" | "drawer" | "external";

export type FeatureAvailability = "always" | "window";

/**
 * Where a feature is configured:
 *   'group' — set once for the whole group (Articles, Chat, Photos, Music,
 *             Polls, My Rounds…). Stored as an org-default row (event_id NULL).
 *   'event' — set per-event (contests, Schedule, Rooms, Trip Info…). Stored as
 *             an event-scoped row.
 * The two admin screens (group vs event Features) each show only their scope.
 */
export type FeatureScope = "group" | "event";

export interface FeatureDef {
  key: string;
  label: string;
  bucket: FeatureBucket;
  scope: FeatureScope;
  /** Icon key resolved by the shared feature-icon map (client) — see FeatureIcon. */
  icon: string;
  status: FeatureStatus;
  surface: FeatureSurface;
  /** One-line "what this is" shown in the launcher and config screen. */
  blurb: string;
  /** Lives in the fixed top utility bar (Chat/Photos/Music/Profile) — never in
   *  the launcher or bottom-bar pins. */
  topbar?: boolean;
  /** Cannot be turned off — reserved for Profile (a member's own account access).
   *  Everything else, including Chat/Photos, is toggleable per the group. */
  alwaysOn?: boolean;
  /** Visible to everyone when the group has no registry row yet (used for Music:
   *  on by default but toggleable). Everything else defaults to 'off' (opt-in). */
  defaultEnabled?: boolean;
  /** Suggested default when a group first exposes it to spectators. */
  defaultPublic?: boolean;
}

export interface BucketDef {
  key: FeatureBucket;
  label: string;
}

/** Buckets in display order — the section headers in "Everything" and config. */
export const FEATURE_BUCKETS: BucketDef[] = [
  { key: "scores", label: "Scores & Games" },
  { key: "schedule", label: "Schedule & Logistics" },
  { key: "community", label: "Community" },
  { key: "stories", label: "Stories & Recognition" },
  { key: "you", label: "You" },
];

/**
 * Every feature the original site offers, bucketed. `status: 'available'` marks
 * the ones actually built in v2 today; the rest are 'planned' placeholders so the
 * config screen shows the full map and each lights up as it's ported.
 */
export const FEATURE_CATALOG: FeatureDef[] = [
  // ── Scores & Games (contests → per event) ────────────────────────────────
  { key: "live_scoring", label: "Live Scoring", bucket: "scores", scope: "event", icon: "flag", status: "planned", surface: "route", blurb: "Score rounds hole-by-hole in real time." },
  { key: "scramble", label: "Scramble", bucket: "scores", scope: "event", icon: "users", status: "planned", surface: "route", blurb: "Team scramble scoring & leaderboard." },
  { key: "skins", label: "Skins", bucket: "scores", scope: "event", icon: "coins", status: "planned", surface: "route", blurb: "Hole-by-hole skins game." },
  { key: "hundred_feet", label: "100 Feet", bucket: "scores", scope: "event", icon: "target", status: "planned", surface: "route", blurb: "Closest-to-100-feet putting contest." },
  { key: "daily_games", label: "Daily Games", bucket: "scores", scope: "event", icon: "dice", status: "planned", surface: "route", blurb: "Per-day side games & contests." },
  { key: "kgb_cup", label: "KGB Cup", bucket: "scores", scope: "event", icon: "trophy", status: "planned", surface: "route", blurb: "Ryder-Cup-style team competition." },
  { key: "calcutta", label: "Calcutta", bucket: "scores", scope: "event", icon: "gavel", status: "planned", surface: "route", blurb: "Player auction & payouts." },
  { key: "cornhole", label: "Cornhole", bucket: "scores", scope: "event", icon: "bracket", status: "planned", surface: "route", blurb: "Cornhole bracket & results." },
  { key: "boland_bet", label: "Boland Bet", bucket: "scores", scope: "event", icon: "coins", status: "planned", surface: "route", blurb: "The house side bet." },
  { key: "bspitw", label: "BSPITW", bucket: "scores", scope: "event", icon: "target", status: "planned", surface: "route", blurb: "Best shot player in the world." },
  { key: "pickem", label: "Pick'em", bucket: "scores", scope: "event", icon: "check", status: "planned", surface: "route", blurb: "Pick winners before play." },

  // ── Schedule & Logistics (mostly per event) ──────────────────────────────
  { key: "schedule", label: "Schedule", bucket: "schedule", scope: "event", icon: "calendar", status: "planned", surface: "route", blurb: "The event itinerary." },
  { key: "courses", label: "Courses", bucket: "schedule", scope: "group", icon: "map", status: "available", surface: "route", blurb: "Course library & scorecards." },
  { key: "rooms", label: "Rooms", bucket: "schedule", scope: "event", icon: "bed", status: "planned", surface: "route", blurb: "Lodging & room assignments." },
  { key: "trip_info", label: "Trip Info", bucket: "schedule", scope: "event", icon: "info", status: "planned", surface: "route", blurb: "Logistics, links & the essentials." },
  { key: "shirt_guide", label: "Shirt Guide", bucket: "schedule", scope: "event", icon: "shirt", status: "planned", surface: "route", blurb: "What to wear each day." },
  { key: "my_options", label: "My Options", bucket: "schedule", scope: "event", icon: "list", status: "planned", surface: "route", blurb: "Add-ons & extras you've chosen." },
  { key: "action_items", label: "Action Items", bucket: "schedule", scope: "event", icon: "check", status: "planned", surface: "route", blurb: "What still needs your attention." },

  // ── Community (group-wide) ───────────────────────────────────────────────
  { key: "chat", label: "Chat", bucket: "community", scope: "group", icon: "chat", status: "available", surface: "drawer", blurb: "Group chat & direct messages.", topbar: true, defaultEnabled: true },
  { key: "photos", label: "Photos", bucket: "community", scope: "group", icon: "image", status: "available", surface: "drawer", blurb: "The shared photo & video gallery.", topbar: true, defaultEnabled: true },
  { key: "music", label: "Music", bucket: "community", scope: "group", icon: "music", status: "available", surface: "drawer", blurb: "The group jukebox & walk-up songs.", topbar: true, defaultEnabled: true },
  { key: "notebook", label: "Notebook", bucket: "community", scope: "group", icon: "book", status: "planned", surface: "route", blurb: "Shared notes & inside jokes." },
  { key: "loozers", label: "Members", bucket: "community", scope: "group", icon: "users", status: "available", surface: "route", blurb: "The member directory." },
  { key: "add_rookie", label: "Add a Rookie", bucket: "community", scope: "group", icon: "userPlus", status: "planned", surface: "route", blurb: "Nominate new members." },

  // ── Stories & Recognition (group-wide) ───────────────────────────────────
  { key: "articles", label: "Articles", bucket: "stories", scope: "group", icon: "news", status: "available", surface: "route", blurb: "News, recaps & posts.", defaultPublic: true },
  { key: "polls", label: "Polls", bucket: "stories", scope: "group", icon: "poll", status: "planned", surface: "route", blurb: "Vote on group questions." },
  { key: "accolades", label: "Accolades", bucket: "stories", scope: "group", icon: "medal", status: "planned", surface: "route", blurb: "Awards & years of history." },
  { key: "best_line", label: "Best Line", bucket: "stories", scope: "group", icon: "quote", status: "planned", surface: "route", blurb: "The best lines of the trip." },

  // ── You (personal) ───────────────────────────────────────────────────────
  { key: "profile", label: "Profile", bucket: "you", scope: "group", icon: "user", status: "available", surface: "drawer", blurb: "Your account & preferences.", topbar: true, alwaysOn: true },
  { key: "my_rounds", label: "My Rounds", bucket: "you", scope: "group", icon: "flag", status: "planned", surface: "route", blurb: "Your rounds & handicap." },
  { key: "financials", label: "Financials", bucket: "you", scope: "event", icon: "wallet", status: "planned", surface: "route", blurb: "Your buy-ins & payouts." },
];

/** Fast lookup by key. */
export const FEATURE_BY_KEY: Record<string, FeatureDef> = Object.fromEntries(
  FEATURE_CATALOG.map((f) => [f.key, f]),
);

/** Three-state feature toggle (see migration 00208). */
export type FeatureVisibility = "off" | "everyone" | "admins";

/** A raw registry row from v2_event_features (org-default or event-override). */
export interface FeatureRow {
  feature_key: string;
  event_id: string | null;
  visibility: FeatureVisibility;
  pinned: boolean;
  nav_order: number;
  label_override: string | null;
  public: boolean;
  availability: FeatureAvailability;
  available_from: string | null;
  available_until: string | null;
}

/** Where a resolved setting came from, for the config screen's inheritance hint. */
export type FeatureSource = "default" | "org" | "event";

/** A catalog feature merged with its effective configuration for an event. */
export interface ResolvedFeature {
  def: FeatureDef;
  visibility: FeatureVisibility;
  pinned: boolean;
  navOrder: number;
  label: string; // label_override || def.label
  public: boolean;
  availability: FeatureAvailability;
  availableFrom: string | null;
  availableUntil: string | null;
  source: FeatureSource; // strongest scope that set visibility
}

function baseResolved(def: FeatureDef): ResolvedFeature {
  return {
    def,
    // alwaysOn (Profile) can't be turned off; a few (Chat/Photos/Music) default
    // to everyone but stay toggleable; everything else is off (opt-in).
    visibility: def.alwaysOn || def.defaultEnabled ? "everyone" : "off",
    pinned: false,
    navOrder: 0,
    label: def.label,
    public: !!def.defaultPublic,
    availability: "always",
    availableFrom: null,
    availableUntil: null,
    source: "default",
  };
}

function applyRow(acc: ResolvedFeature, row: FeatureRow, source: FeatureSource): ResolvedFeature {
  return {
    ...acc,
    visibility: acc.def.alwaysOn ? "everyone" : row.visibility,
    pinned: row.pinned,
    navOrder: row.nav_order,
    label: row.label_override?.trim() || acc.def.label,
    public: row.public,
    availability: row.availability,
    availableFrom: row.available_from,
    availableUntil: row.available_until,
    source,
  };
}

/** Is a feature visible to this viewer? ('admins' requires org admin/owner.) */
export function isVisibleTo(f: ResolvedFeature, viewerIsAdmin: boolean): boolean {
  if (f.visibility === "everyone") return true;
  if (f.visibility === "admins") return viewerIsAdmin;
  return false;
}

/**
 * Merge catalog defaults < org defaults (event_id null) < event overrides for a
 * given event, returning every catalog feature in catalog order.
 */
export function resolveFeatures(rows: FeatureRow[], eventId: string): ResolvedFeature[] {
  const orgRows = new Map(rows.filter((r) => r.event_id === null).map((r) => [r.feature_key, r]));
  const eventRows = new Map(rows.filter((r) => r.event_id === eventId).map((r) => [r.feature_key, r]));

  return FEATURE_CATALOG.map((def) => {
    let acc = baseResolved(def);
    const org = orgRows.get(def.key);
    if (org) acc = applyRow(acc, org, "org");
    const ev = eventRows.get(def.key);
    if (ev) acc = applyRow(acc, ev, "event");
    return acc;
  });
}

/** Is a visible feature currently within its availability window? */
export function isFeatureActive(
  f: ResolvedFeature,
  viewerIsAdmin: boolean,
  now = new Date(),
): boolean {
  if (!isVisibleTo(f, viewerIsAdmin)) return false;
  if (f.availability !== "window") return true;
  const t = now.getTime();
  if (f.availableFrom && t < new Date(f.availableFrom).getTime()) return false;
  if (f.availableUntil && t > new Date(f.availableUntil).getTime()) return false;
  return true;
}

/** The bottom-bar pins: visible, non-topbar, `pinned`, ordered, capped at 3. */
export function pinnedFeatures(
  resolved: ResolvedFeature[],
  viewerIsAdmin: boolean,
  max = 3,
): ResolvedFeature[] {
  return resolved
    .filter((f) => isVisibleTo(f, viewerIsAdmin) && f.pinned && !f.def.topbar)
    .sort((a, b) => a.navOrder - b.navOrder || a.def.label.localeCompare(b.def.label))
    .slice(0, max);
}

/** Visible, non-topbar features grouped for the "Everything" launcher. */
export function launcherBuckets(
  resolved: ResolvedFeature[],
  viewerIsAdmin: boolean,
): { bucket: BucketDef; features: ResolvedFeature[] }[] {
  return FEATURE_BUCKETS.map((bucket) => ({
    bucket,
    features: resolved.filter(
      (f) => isVisibleTo(f, viewerIsAdmin) && !f.def.topbar && f.def.bucket === bucket.key,
    ),
  })).filter((g) => g.features.length > 0);
}

/**
 * Is a specific feature visible to this viewer? Used to gate the top-bar utility
 * buttons (Chat/Photos/Music). Defaults to visible if the feature has no row yet
 * (so the app doesn't hide things before the registry is configured).
 */
export function isFeatureVisible(
  resolved: ResolvedFeature[],
  key: string,
  viewerIsAdmin: boolean,
): boolean {
  const f = resolved.find((r) => r.def.key === key);
  return f ? isVisibleTo(f, viewerIsAdmin) : true;
}

/** Is Music visible to this viewer? (topbar utility with a group toggle.) */
export function isMusicEnabled(resolved: ResolvedFeature[], viewerIsAdmin: boolean): boolean {
  return isFeatureVisible(resolved, "music", viewerIsAdmin);
}

/** Max number of bottom-bar pins (Home + these + Everything + Admin). */
export const MAX_PINNED = 3;

/* ── Nav building (bottom bar + "Everything" launcher) ─────────────────────── */

/**
 * Destination path for a feature's landing page, or null if it isn't browsable
 * yet. Only `route`/`external` features route here (tier-1 drawers open in place).
 * As each feature ports, add its route here and flip its catalog `status`.
 */
const FEATURE_ROUTES: Record<string, (slug: string) => string> = {
  articles: (slug) => `/new/${slug}/articles`,
  courses: (slug) => `/new/${slug}/courses`,
  loozers: (slug) => `/new/${slug}/loozers`,
};

export function featureHref(slug: string, def: FeatureDef): string | null {
  const build = FEATURE_ROUTES[def.key];
  return build ? build(slug) : null;
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** A resolved feature flattened for the shell (bottom bar + launcher). */
export interface NavFeature {
  key: string;
  label: string;
  icon: string;
  bucket: FeatureBucket;
  blurb: string;
  href: string | null;
  /** Navigable right now (has a destination and within any availability window). */
  active: boolean;
  /** Why it isn't navigable ("Coming soon" / "Opens Mar 3" / "Closed"), or null. */
  lockReason: string | null;
  /** Shown only to admins (visibility='admins') — badge it so they know. */
  adminOnly: boolean;
}

function lockReasonFor(f: ResolvedFeature, href: string | null, now: Date): string | null {
  if (f.availability === "window") {
    if (f.availableFrom && now.getTime() < new Date(f.availableFrom).getTime()) {
      return `Opens ${fmtShortDate(f.availableFrom)}`;
    }
    if (f.availableUntil && now.getTime() > new Date(f.availableUntil).getTime()) {
      return "Closed";
    }
  }
  return href ? null : "Coming soon";
}

export function toNavFeature(slug: string, f: ResolvedFeature, now = new Date()): NavFeature {
  const href = featureHref(slug, f.def);
  const lockReason = lockReasonFor(f, href, now);
  return {
    key: f.def.key,
    label: f.label,
    icon: f.def.icon,
    bucket: f.def.bucket,
    blurb: f.def.blurb,
    href,
    active: lockReason === null,
    lockReason,
    adminOnly: f.visibility === "admins",
  };
}

export interface LauncherGroup {
  bucketKey: FeatureBucket;
  bucketLabel: string;
  features: NavFeature[];
}

/**
 * The complete shell nav for an event: the (≤3) bottom-bar pins and the
 * "Everything" launcher grouped by bucket. Availability windows are resolved
 * against `now` on the server, so the client renders static state (no Date in
 * render). Falls back to empty arrays when nothing is enabled.
 */
export function buildEventNav(
  slug: string,
  resolved: ResolvedFeature[],
  viewerIsAdmin: boolean,
  now = new Date(),
): { pinned: NavFeature[]; launcher: LauncherGroup[] } {
  const pinned = pinnedFeatures(resolved, viewerIsAdmin).map((f) => toNavFeature(slug, f, now));
  const launcher = launcherBuckets(resolved, viewerIsAdmin).map((g) => ({
    bucketKey: g.bucket.key,
    bucketLabel: g.bucket.label,
    features: g.features.map((f) => toNavFeature(slug, f, now)),
  }));
  return { pinned, launcher };
}
