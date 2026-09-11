import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin, isOrgMember } from "@/lib/v2/orgs";
import {
  FEATURE_BY_KEY,
  MAX_PINNED,
  resolveFeatures,
  type FeatureRow,
} from "@/lib/v2/features";

/**
 * The per-event feature registry (see docs/v2-information-architecture.md).
 *
 * GET  — the effective, resolved feature list for this event (catalog + config).
 *        Members can read (they need it to build their nav); returns raw rows too
 *        so the admin editor knows what's set at the event scope.
 * PUT  — admins overwrite the event-scoped config for the given features. Only
 *        `available`, non-tier1 features are writable; planned/tier1 keys are
 *        rejected. Enforces the max-3 pin cap.
 */

async function loadRows(admin: ReturnType<typeof v2AdminClient>, orgId: string, eventId: string) {
  // Both scopes: org defaults (event_id null) + this event's overrides.
  const { data } = await admin
    .from("v2_event_features")
    .select(
      "feature_key, event_id, visibility, pinned, nav_order, label_override, public, availability, available_from, available_until",
    )
    .eq("org_id", orgId)
    .or(`event_id.is.null,event_id.eq.${eventId}`);
  return (data as FeatureRow[] | null) ?? [];
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> },
) {
  const { id, eventId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, id))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const rows = await loadRows(admin, id, eventId);
  const resolved = resolveFeatures(rows, eventId);
  return NextResponse.json({ features: resolved });
}

const VISIBILITIES = ["off", "everyone", "admins"];

interface FeatureInput {
  feature_key: string;
  visibility?: string;
  pinned?: boolean;
  nav_order?: number;
  label_override?: string | null;
  public?: boolean;
  availability?: string;
  available_from?: string | null;
  available_until?: string | null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> },
) {
  const { id, eventId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, id))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let body: { features?: FeatureInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const inputs = Array.isArray(body.features) ? body.features : [];

  // Validate keys: must be catalogued, event-scoped, built ('available'), and not
  // an always-on utility.
  const now = new Date().toISOString();
  const rows = [] as Record<string, unknown>[];
  let pinnedCount = 0;
  for (const inp of inputs) {
    const def = FEATURE_BY_KEY[inp.feature_key];
    if (!def) return NextResponse.json({ error: `Unknown feature: ${inp.feature_key}` }, { status: 400 });
    if (def.alwaysOn) return NextResponse.json({ error: `${def.label} is always on` }, { status: 400 });
    if (def.scope !== "event") {
      return NextResponse.json({ error: `${def.label} is configured in Group features` }, { status: 400 });
    }
    if (def.status !== "available") {
      return NextResponse.json({ error: `${def.label} isn't available yet` }, { status: 400 });
    }
    const visibility = VISIBILITIES.includes(inp.visibility || "") ? inp.visibility! : "off";
    const on = visibility !== "off";
    const pinned = on && !!inp.pinned;
    if (pinned) pinnedCount += 1;
    const availability = inp.availability === "window" ? "window" : "always";
    rows.push({
      org_id: id,
      event_id: eventId,
      feature_key: inp.feature_key,
      visibility,
      pinned,
      nav_order: Number.isFinite(inp.nav_order) ? Math.trunc(inp.nav_order as number) : 0,
      label_override: inp.label_override?.trim() || null,
      // Spectator-public only makes sense when the feature is on for everyone.
      public: visibility === "everyone" && !!inp.public,
      availability,
      available_from: availability === "window" ? inp.available_from || null : null,
      available_until: availability === "window" ? inp.available_until || null : null,
      updated_at: now,
      updated_by: userId,
    });
  }

  if (pinnedCount > MAX_PINNED) {
    return NextResponse.json(
      { error: `You can pin at most ${MAX_PINNED} features to the bottom bar.` },
      { status: 400 },
    );
  }

  // Replace the event-scoped rows for exactly the keys we were given (a partial
  // unique index can't be inferred by PostgREST upsert, so delete-then-insert).
  if (rows.length) {
    const keys = rows.map((r) => r.feature_key as string);
    const { error: delErr } = await admin
      .from("v2_event_features")
      .delete()
      .eq("org_id", id)
      .eq("event_id", eventId)
      .in("feature_key", keys);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    const { error: insErr } = await admin.from("v2_event_features").insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const fresh = await loadRows(admin, id, eventId);
  return NextResponse.json({ features: resolveFeatures(fresh, eventId) });
}
