import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";

/**
 * GET /api/v2/music/walkups?orgId= — the walk-up roster in play order. Roster =
 *   the active event's participants (excluding not-going), else all active org
 *   members. Each row carries the Loozer's tagged songs, chosen song, start
 *   offset, and order (saved sort_order overrides the default alphabetical order).
 * PUT /api/v2/music/walkups — { action: "reorder" | "meta" | "reset", ... }.
 * Both require manage_music (or org admin).
 */

interface WalkupSong {
  id: string;
  title: string;
  mp3_url: string;
  art_url: string | null;
  art_thumb_url: string | null;
  duration_seconds: number | null;
}

async function guard(request: Request, orgId: string | null) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: "Not authenticated", status: 401 as const };
  if (!orgId) return { error: "orgId required", status: 400 as const };
  const admin = v2AdminClient();
  if (!(await hasPermission(admin, userId, orgId, "manage_music"))) {
    return { error: "Not allowed", status: 403 as const };
  }
  return { admin, userId };
}

export async function GET(request: Request) {
  const orgId = new URL(request.url).searchParams.get("orgId");
  const g = await guard(request, orgId);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const admin = g.admin;

  // Active event (if any) → its going/maybe participants; else all active members.
  const { data: activeEvent } = await admin
    .from("v2_events")
    .select("id")
    .eq("org_id", orgId!)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const eventId = (activeEvent?.id as string | undefined) ?? null;

  let rosterIds: string[] = [];
  if (eventId) {
    const { data } = await admin
      .from("v2_event_participants")
      .select("user_id, status")
      .eq("event_id", eventId)
      .neq("status", "not_going");
    rosterIds = [...new Set((data || []).map((p) => p.user_id))];
  }
  if (rosterIds.length === 0) {
    const { data } = await admin
      .from("v2_memberships")
      .select("user_id, profile:v2_profiles(is_system)")
      .eq("org_id", orgId!)
      .eq("status", "active");
    rosterIds = (data || [])
      .filter((m) => {
        const p = Array.isArray(m.profile) ? m.profile[0] : m.profile;
        return !(p as { is_system?: boolean } | null)?.is_system;
      })
      .map((m) => m.user_id);
  }
  if (rosterIds.length === 0) return NextResponse.json({ eventId, rows: [] });

  const [profRes, songRes, entryRes] = await Promise.all([
    admin
      .from("v2_profiles")
      .select("id, display_name, first_name, last_name, nickname, avatar_url")
      .in("id", rosterIds),
    admin
      .from("v2_songs")
      .select("id, title, mp3_url, art_url, art_thumb_url, duration_seconds, tagged_user_id")
      .eq("org_id", orgId!)
      .in("tagged_user_id", rosterIds)
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true }),
    admin
      .from("v2_walkup_entries")
      .select("user_id, song_id, start_seconds, sort_order")
      .eq("org_id", orgId!),
  ]);

  const profById = new Map((profRes.data || []).map((p) => [p.id, p]));
  const songsByUser = new Map<string, WalkupSong[]>();
  for (const s of songRes.data || []) {
    const uid = s.tagged_user_id as string;
    const list = songsByUser.get(uid) || [];
    list.push({ id: s.id, title: s.title, mp3_url: s.mp3_url, art_url: s.art_url, art_thumb_url: s.art_thumb_url, duration_seconds: s.duration_seconds });
    songsByUser.set(uid, list);
  }
  const entries = new Map(
    (entryRes.data || []).map((e) => [e.user_id, { song_id: e.song_id, start_seconds: e.start_seconds, sort_order: e.sort_order }]),
  );
  const hasSavedOrder = [...entries.values()].some((e) => e.sort_order != null);

  // Default order: alphabetical by display name.
  const defaultSeq = [...rosterIds].sort((a, b) =>
    (profById.get(a)?.display_name || "").localeCompare(profById.get(b)?.display_name || ""),
  );
  const defaultIndex = new Map<string, number>();
  defaultSeq.forEach((id, i) => defaultIndex.set(id, i));

  const rows = rosterIds.map((uid) => {
    const p = profById.get(uid);
    const saved = entries.get(uid);
    const songs = songsByUser.get(uid) || [];
    let chosen: string | null = saved?.song_id ?? null;
    if (chosen && !songs.some((s) => s.id === chosen)) chosen = null;
    if (!chosen && songs.length === 1) chosen = songs[0].id;
    return {
      user_id: uid,
      display_name: p?.display_name || "Member",
      first_name: p?.first_name ?? null,
      last_name: p?.last_name ?? null,
      nickname: p?.nickname ?? null,
      avatar_url: p?.avatar_url ?? null,
      songs,
      song_id: chosen,
      start_seconds: saved?.start_seconds ?? 0,
      sort_order: saved?.sort_order ?? defaultIndex.get(uid) ?? 0,
    };
  });

  rows.sort((a, b) => {
    if (hasSavedOrder) {
      const sa = entries.get(a.user_id)?.sort_order;
      const sb = entries.get(b.user_id)?.sort_order;
      const as = sa != null ? sa : 1_000_000 + (defaultIndex.get(a.user_id) ?? 0);
      const bs = sb != null ? sb : 1_000_000 + (defaultIndex.get(b.user_id) ?? 0);
      return as - bs;
    }
    return (defaultIndex.get(a.user_id) ?? 0) - (defaultIndex.get(b.user_id) ?? 0);
  });

  return NextResponse.json({ eventId, rows });
}

export async function PUT(request: Request) {
  let body: {
    orgId?: string;
    action?: "reorder" | "meta" | "reset";
    order?: { user_id: string; sort_order: number }[];
    user_id?: string;
    song_id?: string | null;
    start_seconds?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const g = await guard(request, body.orgId ?? null);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const admin = g.admin;
  const orgId = body.orgId!;

  if (body.action === "reset") {
    const { error } = await admin.from("v2_walkup_entries").update({ sort_order: null }).eq("org_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "meta") {
    if (!body.user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });
    const { error } = await admin.from("v2_walkup_entries").upsert(
      {
        org_id: orgId,
        user_id: body.user_id,
        song_id: body.song_id || null,
        start_seconds: Math.max(0, Math.round(Number(body.start_seconds) || 0)),
      },
      { onConflict: "org_id,user_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reorder") {
    if (!Array.isArray(body.order) || body.order.length === 0) {
      return NextResponse.json({ error: "order array required" }, { status: 400 });
    }
    const rows = body.order.map((e) => ({
      org_id: orgId,
      user_id: e.user_id,
      sort_order: Math.round(Number(e.sort_order) || 0),
    }));
    const { error } = await admin.from("v2_walkup_entries").upsert(rows, { onConflict: "org_id,user_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
