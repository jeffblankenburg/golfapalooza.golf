import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";
import { getEffectiveTripId } from "@/lib/simulator";

// The Thursday scramble round. Per event_days seeding, day 2 = "Scramble Day 1"
// (the first scramble day, played Thursday). Tee times for this day drive the
// default walk-up order. Bump this if the schedule ever changes.
const THURSDAY_SCRAMBLE_DAY = 2;

interface WalkupSong {
  id: string;
  title: string;
  mp3_url: string;
  art_thumb_url: string | null;
  art_url: string | null;
  duration_seconds: number | null;
}

/**
 * @swagger
 * /api/admin/music/walkups:
 *   get:
 *     tags: [Admin]
 *     summary: Walk-up song roster for the Thursday scramble
 *     description: >
 *       Returns every rostered Loozer for the active/effective trip in walk-up
 *       play order. Default order comes from the day-2 (Thursday) tee-time groups
 *       (group order by tee time, players within a group by handicap ascending);
 *       any saved walkup_entries override the order, chosen song, and start time.
 *     responses:
 *       200: { description: Ordered walk-up list }
 *       401: { description: Unauthorized }
 */
export async function GET() {
  const admin = await checkPermissionAccess("manage_music");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tripId = await getEffectiveTripId();
  if (!tripId) {
    return NextResponse.json({ error: "No active trip" }, { status: 404 });
  }

  const supabase = createAdminClient();

  const [
    participantsRes,
    songsRes,
    eventHcpRes,
    liveHcpRes,
    teeTimesRes,
    scrambleContestsRes,
    entriesRes,
  ] = await Promise.all([
    supabase
      .from("event_participants")
      .select("user_id, user:users!event_participants_user_id_fkey(id, display_name, avatar_url)")
      .eq("trip_id", tripId)
      .eq("on_roster", true),
    supabase
      .from("songs")
      .select("id, title, mp3_url, art_thumb_url, art_url, duration_seconds, tagged_user_id")
      .not("tagged_user_id", "is", null)
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true }),
    supabase
      .from("event_player_handicaps")
      .select("user_id, handicap_index")
      .eq("trip_id", tripId),
    supabase.from("player_handicaps").select("user_id, handicap_index"),
    supabase
      .from("tee_times")
      .select("id, tee_time, created_at, players:tee_time_players(user_id)")
      .eq("trip_id", tripId)
      .eq("day_number", THURSDAY_SCRAMBLE_DAY),
    // Fallback grouping source when tee times aren't built yet: the Thursday
    // scramble contest's teams.
    supabase
      .from("contests")
      .select("id, scramble_teams(id, team_handicap, created_at, members:scramble_team_members(user_id))")
      .eq("trip_id", tripId)
      .eq("contest_type", "scramble")
      .eq("day_number", THURSDAY_SCRAMBLE_DAY),
    supabase
      .from("walkup_entries")
      .select("user_id, song_id, start_seconds, sort_order")
      .eq("trip_id", tripId),
  ]);

  const firstErr =
    participantsRes.error ||
    songsRes.error ||
    eventHcpRes.error ||
    liveHcpRes.error ||
    teeTimesRes.error ||
    scrambleContestsRes.error ||
    entriesRes.error;
  if (firstErr) {
    return NextResponse.json({ error: firstErr.message }, { status: 500 });
  }

  // Handicap: prefer the event-locked snapshot, fall back to the live index.
  const handicaps = new Map<string, number | null>();
  for (const row of liveHcpRes.data || []) {
    handicaps.set(row.user_id, row.handicap_index);
  }
  for (const row of eventHcpRes.data || []) {
    handicaps.set(row.user_id, row.handicap_index);
  }

  // Songs grouped by tagged Loozer.
  const songsByUser = new Map<string, WalkupSong[]>();
  for (const s of songsRes.data || []) {
    const uid = s.tagged_user_id as string;
    const list = songsByUser.get(uid) || [];
    list.push({
      id: s.id,
      title: s.title,
      mp3_url: s.mp3_url,
      art_thumb_url: s.art_thumb_url,
      art_url: s.art_url,
      duration_seconds: s.duration_seconds,
    });
    songsByUser.set(uid, list);
  }

  // Saved overrides. sort_order is NULL unless the player was manually dragged;
  // song_id / start_seconds are independent per-row edits.
  const entries = new Map<
    string,
    { song_id: string | null; start_seconds: number; sort_order: number | null }
  >();
  for (const e of entriesRes.data || []) {
    entries.set(e.user_id, {
      song_id: e.song_id,
      start_seconds: e.start_seconds,
      sort_order: e.sort_order,
    });
  }
  // A manual order exists only when at least one row has a non-null sort_order.
  const hasSavedOrder = [...entries.values()].some((e) => e.sort_order != null);

  // Within a group, players are ordered by handicap high → low ("hi-lo"),
  // nulls last.
  const hcpSort = (a: string, b: string) => {
    const ha = handicaps.get(a);
    const hb = handicaps.get(b);
    if (ha == null && hb == null) return 0;
    if (ha == null) return 1;
    if (hb == null) return -1;
    return hb - ha;
  };

  // Build the default group order. Prefer the day-2 tee-time groups (ordered by
  // tee time, nulls last then creation order). If none are built yet, fall back
  // to the Thursday scramble teams in group order (creation order = Group 1,
  // Group 2, …).
  type Group = { members: string[]; teeTime: string | null };
  let groups: Group[] = [];

  const teeTimes = [...(teeTimesRes.data || [])].sort((a, b) => {
    if (a.tee_time && b.tee_time) return a.tee_time < b.tee_time ? -1 : a.tee_time > b.tee_time ? 1 : 0;
    if (a.tee_time) return -1;
    if (b.tee_time) return 1;
    return (a.created_at || "") < (b.created_at || "") ? -1 : 1;
  });
  const teeGroups: Group[] = teeTimes
    .map((tt) => ({
      members: (tt.players || []).map((p: { user_id: string }) => p.user_id),
      teeTime: tt.tee_time as string | null,
    }))
    .filter((g) => g.members.length > 0);

  if (teeGroups.length > 0) {
    groups = teeGroups;
  } else {
    const teams = (scrambleContestsRes.data || [])
      .flatMap((c) => (c.scramble_teams || []) as Array<{ id: string; team_handicap: number | null; created_at: string; members: Array<{ user_id: string }> }>)
      // Group order = creation order (Group 1, Group 2, …).
      .sort((a, b) => ((a.created_at || "") < (b.created_at || "") ? -1 : 1));
    groups = teams
      .map((t) => ({ members: (t.members || []).map((m) => m.user_id), teeTime: null }))
      .filter((g) => g.members.length > 0);
  }

  // groupInfo: user -> { groupNumber, teeTime }
  const groupInfo = new Map<string, { groupNumber: number; teeTime: string | null }>();
  const defaultOrder: string[] = [];
  groups.forEach((g, i) => {
    const members = [...g.members].sort(hcpSort);
    for (const uid of members) {
      if (!groupInfo.has(uid)) {
        groupInfo.set(uid, { groupNumber: i + 1, teeTime: g.teeTime });
        defaultOrder.push(uid);
      }
    }
  });

  const rostered = (participantsRes.data || [])
    .map((p) => {
      const u = Array.isArray(p.user) ? p.user[0] : p.user;
      return u
        ? { id: u.id as string, display_name: u.display_name as string, avatar_url: u.avatar_url as string | null }
        : null;
    })
    .filter((u): u is { id: string; display_name: string; avatar_url: string | null } => !!u);

  const rosterIds = new Set(rostered.map((u) => u.id));

  // Rostered players not in any Thursday group go at the end, handicap hi → lo.
  const ungrouped = rostered
    .map((u) => u.id)
    .filter((id) => !groupInfo.has(id))
    .sort(hcpSort);
  const defaultSequence = [...defaultOrder.filter((id) => rosterIds.has(id)), ...ungrouped];
  const defaultIndex = new Map<string, number>();
  defaultSequence.forEach((id, i) => defaultIndex.set(id, i));

  const userById = new Map(rostered.map((u) => [u.id, u]));

  const rows = rostered.map((u) => {
    const saved = entries.get(u.id);
    const songs = songsByUser.get(u.id) || [];
    // Resolve the chosen song: saved choice if still valid, else the sole song, else null.
    let chosenSongId: string | null = saved?.song_id ?? null;
    if (chosenSongId && !songs.some((s) => s.id === chosenSongId)) chosenSongId = null;
    if (!chosenSongId && songs.length === 1) chosenSongId = songs[0].id;

    const gi = groupInfo.get(u.id) || null;
    return {
      user_id: u.id,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      handicap: handicaps.get(u.id) ?? null,
      group_number: gi?.groupNumber ?? null,
      tee_time: gi?.teeTime ?? null,
      songs,
      song_id: chosenSongId,
      start_seconds: saved?.start_seconds ?? 0,
      sort_order: saved?.sort_order ?? defaultIndex.get(u.id) ?? 0,
    };
  });

  // Order: a manually-set sort_order is authoritative (dragged players hold
  // their slot; everyone else falls to the bottom by group order). With no
  // manual order at all, use the pure group/tee-time default.
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

  void userById;
  return NextResponse.json({ rows });
}

/**
 * @swagger
 * /api/admin/music/walkups:
 *   put:
 *     tags: [Admin]
 *     summary: Save walk-up order, song choices, and start times
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               entries:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     user_id: { type: string }
 *                     song_id: { type: string, nullable: true }
 *                     start_seconds: { type: integer }
 *                     sort_order: { type: integer }
 *     responses:
 *       200: { description: Saved }
 *       401: { description: Unauthorized }
 */
export async function PUT(request: Request) {
  const admin = await checkPermissionAccess("manage_music");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tripId = await getEffectiveTripId();
  if (!tripId) {
    return NextResponse.json({ error: "No active trip" }, { status: 404 });
  }

  let body: {
    action?: "reorder" | "meta" | "reset";
    order?: Array<{ user_id: string; sort_order: number }>;
    user_id?: string;
    song_id?: string | null;
    start_seconds?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Clear all manual ordering → revert to the computed group/tee-time order.
  if (body.action === "reset") {
    const { error } = await supabase
      .from("walkup_entries")
      .update({ sort_order: null, updated_at: now })
      .eq("trip_id", tripId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Per-row song / start-time edit. Only touches those columns — sort_order is
  // left intact (new rows get NULL), so editing never pins the list order.
  if (body.action === "meta") {
    if (!body.user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }
    const { error } = await supabase.from("walkup_entries").upsert(
      {
        trip_id: tripId,
        user_id: body.user_id,
        song_id: body.song_id || null,
        start_seconds: Math.max(0, Math.round(Number(body.start_seconds) || 0)),
        updated_at: now,
      },
      { onConflict: "trip_id,user_id" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Manual reorder. Writes sort_order for every row; song_id / start_seconds are
  // omitted from the payload so an existing row's choices are preserved.
  if (body.action === "reorder") {
    const order = body.order;
    if (!Array.isArray(order) || order.length === 0) {
      return NextResponse.json({ error: "order array required" }, { status: 400 });
    }
    const rows = order.map((e) => ({
      trip_id: tripId,
      user_id: e.user_id,
      sort_order: Math.round(Number(e.sort_order) || 0),
      updated_at: now,
    }));
    const { error } = await supabase
      .from("walkup_entries")
      .upsert(rows, { onConflict: "trip_id,user_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
