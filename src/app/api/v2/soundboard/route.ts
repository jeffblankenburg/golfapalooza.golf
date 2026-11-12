import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";
import type { Sound, SoundboardTag, SoundboardData } from "@/lib/v2/soundboard-types";

/**
 * GET /api/v2/soundboard?orgId= — the operator's whole payload in one shot:
 *   sounds (with tag_ids + counters), the tag vocabulary, and the caller's
 *   most-played sound ids. Everything after this is client-side (tag filter,
 *   group, search). Gated by manage_soundboard.
 * POST /api/v2/soundboard — create a sound (+ tag assignments). manage_soundboard.
 * PUT  /api/v2/soundboard — reorder ({ orgId, order: [{id, sort_order}] }).
 */

const SOUND_SELECT =
  "id, name, audio_url, emoji, image_url, play_count, sort_order, v2_sound_tag_map(tag_id)";

type RawSound = Omit<Sound, "tag_ids"> & { v2_sound_tag_map: { tag_id: string }[] | null };

async function requireOperator(userId: string, orgId: string) {
  const admin = v2AdminClient();
  const ok = await hasPermission(admin, userId, orgId, "manage_soundboard");
  return ok ? admin : null;
}

export async function GET(request: Request) {
  const orgId = new URL(request.url).searchParams.get("orgId");
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const admin = await requireOperator(userId, orgId);
  if (!admin) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const [{ data: sounds, error }, { data: tags }, { data: myPlays }] = await Promise.all([
    admin
      .from("v2_sounds")
      .select(SOUND_SELECT)
      .eq("org_id", orgId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    admin
      .from("v2_sound_tags")
      .select("id, name, color, sort_order")
      .eq("org_id", orgId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    admin
      .from("v2_sound_user_plays")
      .select("sound_id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .order("play_count", { ascending: false })
      .limit(12),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out: SoundboardData = {
    sounds: (sounds as RawSound[] | null ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      audio_url: s.audio_url,
      emoji: s.emoji,
      image_url: s.image_url,
      play_count: s.play_count,
      sort_order: s.sort_order,
      tag_ids: (s.v2_sound_tag_map ?? []).map((m) => m.tag_id),
    })),
    tags: (tags as SoundboardTag[] | null) ?? [],
    myTop: (myPlays ?? []).map((r) => r.sound_id as string),
  };
  return NextResponse.json(out);
}

export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: {
    orgId?: string;
    name?: string;
    emoji?: string | null;
    audio_url?: string;
    audio_path?: string;
    image_url?: string | null;
    image_path?: string | null;
    tagIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const orgId = body.orgId;
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });
  if (!body.audio_url || !body.audio_path)
    return NextResponse.json({ error: "An audio file is required" }, { status: 400 });

  const admin = await requireOperator(userId, orgId);
  if (!admin) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const { data: last } = await admin
    .from("v2_sounds")
    .select("sort_order")
    .eq("org_id", orgId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (last?.sort_order ?? -1) + 1;

  const { data: created, error } = await admin
    .from("v2_sounds")
    .insert({
      org_id: orgId,
      name,
      emoji: (body.emoji || "").trim() || null,
      audio_url: body.audio_url,
      audio_path: body.audio_path,
      image_url: body.image_url ?? null,
      image_path: body.image_path ?? null,
      created_by: userId,
      sort_order: sortOrder,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tagIds = Array.from(new Set(body.tagIds ?? []));
  if (tagIds.length) {
    await admin
      .from("v2_sound_tag_map")
      .insert(tagIds.map((tag_id) => ({ sound_id: created.id, tag_id, org_id: orgId })));
  }

  return NextResponse.json({ id: created.id });
}

export async function PUT(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { orgId?: string; order?: { id: string; sort_order: number }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const orgId = body.orgId;
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
  if (!Array.isArray(body.order)) return NextResponse.json({ error: "order required" }, { status: 400 });

  const admin = await requireOperator(userId, orgId);
  if (!admin) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  await Promise.all(
    body.order.map((o) =>
      admin.from("v2_sounds").update({ sort_order: o.sort_order }).eq("id", o.id).eq("org_id", orgId),
    ),
  );
  return NextResponse.json({ ok: true });
}
