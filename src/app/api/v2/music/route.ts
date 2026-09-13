import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";
import { hasPermission } from "@/lib/v2/permissions-server";
import { logActivity } from "@/lib/v2/activity";

/**
 * GET /api/v2/music?orgId=[&admin=1] — the org's song catalog (sort_order, then
 *   title). Member view flags each with the caller's is_favorite. With admin=1
 *   (requires manage_music) it also attaches play/like counts and the roster
 *   (for the tagged-Loozer picker).
 * POST /api/v2/music — create a song (manage_music). Also logs a "song" activity.
 * PUT  /api/v2/music — reorder ({ orgId, order: [{id, sort_order}] }) (manage_music).
 * Auth: bearer/cookie.
 */

const SONG_SELECT =
  "id, title, mp3_url, art_url, art_thumb_url, lyrics, duration_seconds, sort_order, tagged_user:v2_profiles!v2_songs_tagged_user_id_fkey(id, display_name, first_name, last_name, avatar_url)";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = url.searchParams.get("orgId");
  const wantAdmin = url.searchParams.get("admin") === "1";
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const admin = v2AdminClient();

  if (wantAdmin) {
    if (!(await hasPermission(admin, userId, orgId, "manage_music"))) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    const [{ data: songs, error }, { data: plays }, { data: favs }, { data: mems }] = await Promise.all([
      admin
        .from("v2_songs")
        .select(SONG_SELECT)
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true }),
      admin.rpc("v2_song_play_counts", { p_org: orgId }),
      admin.rpc("v2_song_favorite_counts", { p_org: orgId }),
      admin
        .from("v2_memberships")
        .select("user_id, profile:v2_profiles(display_name, first_name, last_name, nickname, is_system)")
        .eq("org_id", orgId)
        .eq("status", "active"),
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const playMap = new Map((plays || []).map((r: { song_id: string; play_count: number }) => [r.song_id, Number(r.play_count)]));
    const likeMap = new Map((favs || []).map((r: { song_id: string; like_count: number }) => [r.song_id, Number(r.like_count)]));
    const songsOut = (songs || []).map((s) => {
      const tagged = Array.isArray(s.tagged_user) ? s.tagged_user[0] ?? null : s.tagged_user ?? null;
      return { ...s, tagged_user: tagged, play_count: playMap.get(s.id) ?? 0, like_count: likeMap.get(s.id) ?? 0 };
    });
    const members = (mems || [])
      .map((m) => {
        const p = (Array.isArray(m.profile) ? m.profile[0] : m.profile) as
          | { display_name?: string; first_name?: string | null; last_name?: string | null; nickname?: string | null; is_system?: boolean }
          | null;
        return {
          user_id: m.user_id,
          display_name: p?.display_name || "Member",
          first_name: p?.first_name ?? null,
          last_name: p?.last_name ?? null,
          nickname: p?.nickname ?? null,
          is_system: !!p?.is_system,
        };
      })
      .filter((m) => !m.is_system);

    return NextResponse.json({ songs: songsOut, members });
  }

  // Member view.
  if (!(await isOrgMember(admin, userId, orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  const [{ data: songs, error }, { data: favorites }] = await Promise.all([
    admin
      .from("v2_songs")
      .select(SONG_SELECT)
      .eq("org_id", orgId)
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true }),
    admin.from("v2_song_favorites").select("song_id").eq("user_id", userId),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const favIds = new Set((favorites || []).map((f) => f.song_id));
  const withFav = (songs || []).map((s) => {
    const tagged = Array.isArray(s.tagged_user) ? s.tagged_user[0] ?? null : s.tagged_user ?? null;
    return { ...s, tagged_user: tagged, is_favorite: favIds.has(s.id) };
  });
  return NextResponse.json({ songs: withFav });
}

export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: {
    orgId?: string;
    title?: string;
    mp3_url?: string;
    art_url?: string | null;
    art_thumb_url?: string | null;
    lyrics?: string | null;
    tagged_user_id?: string | null;
    duration_seconds?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const orgId = body.orgId;
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
  const title = (body.title || "").trim();
  if (!title) return NextResponse.json({ error: "A title is required" }, { status: 400 });
  if (!body.mp3_url) return NextResponse.json({ error: "An audio file is required" }, { status: 400 });

  const admin = v2AdminClient();
  if (!(await hasPermission(admin, userId, orgId, "manage_music"))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  // Append to the end of the catalog.
  const { data: last } = await admin
    .from("v2_songs")
    .select("sort_order")
    .eq("org_id", orgId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (last?.sort_order ?? -1) + 1;

  const { data: created, error } = await admin
    .from("v2_songs")
    .insert({
      org_id: orgId,
      title,
      mp3_url: body.mp3_url,
      art_url: body.art_url ?? null,
      art_thumb_url: body.art_thumb_url ?? body.art_url ?? null,
      lyrics: (body.lyrics || "").trim() || null,
      tagged_user_id: body.tagged_user_id ?? null,
      duration_seconds: body.duration_seconds ?? null,
      sort_order: sortOrder,
    })
    .select("id, art_thumb_url, art_url")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(admin, {
    orgId,
    kind: "song",
    actorId: userId,
    title: "added a song",
    subtitle: title,
    imageUrl: created.art_thumb_url || created.art_url || null,
    refId: created.id,
  }).catch(() => {});

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

  const admin = v2AdminClient();
  if (!(await hasPermission(admin, userId, orgId, "manage_music"))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  // Apply each new sort_order, scoped to the org so no cross-org writes.
  await Promise.all(
    body.order.map((o) =>
      admin.from("v2_songs").update({ sort_order: o.sort_order }).eq("id", o.id).eq("org_id", orgId),
    ),
  );
  return NextResponse.json({ ok: true });
}
