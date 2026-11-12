import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";

/**
 * GET /api/v2/soundboard/stats?orgId= — the "top blaster" per sound (who played
 * each clip the most), resolved to display names. Reads the per-user counter via
 * the v2_soundboard_top_blasters RPC (no aggregate, no 1000-row cap).
 * manage_soundboard.
 */
export async function GET(request: Request) {
  const orgId = new URL(request.url).searchParams.get("orgId");
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const admin = v2AdminClient();
  if (!(await hasPermission(admin, userId, orgId, "manage_soundboard"))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const { data: rows, error } = await admin.rpc("v2_soundboard_top_blasters", { p_org: orgId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const top = (rows ?? []) as { sound_id: string; user_id: string; play_count: number }[];
  const userIds = Array.from(new Set(top.map((r) => r.user_id)));
  const nameMap = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await admin
      .from("v2_profiles")
      .select("id, display_name, first_name, nickname")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      nameMap.set(p.id, p.nickname || p.display_name || p.first_name || "Member");
    }
  }

  return NextResponse.json({
    topBlasters: top.map((r) => ({
      sound_id: r.sound_id,
      user_id: r.user_id,
      name: nameMap.get(r.user_id) ?? "Member",
      play_count: r.play_count,
    })),
  });
}
