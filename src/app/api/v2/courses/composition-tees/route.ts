import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { courseEditGateByTee } from "@/lib/v2/courses/edit-access";

/**
 * Hybrid ("composition") tee mappings for the universal v2 library. A hybrid tee
 * points each hole at a source tee. Any signed-in user may manage (universal edit).
 *   GET    ?tee_id= — the tee's per-hole source mappings + which tees are hybrids
 *   POST   { tee_id, mappings:[{hole_number, source_tee_id}] } — upsert all holes
 *   DELETE { tee_id } — clear mappings (makes it a regular tee again)
 */

export async function GET(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const teeId = new URL(request.url).searchParams.get("tee_id");
  if (!teeId) return NextResponse.json({ error: "tee_id required" }, { status: 400 });

  const admin = v2AdminClient();
  const [{ data, error }, { data: allComposition }] = await Promise.all([
    admin.from("v2_composition_tee_mappings").select("hole_number, source_tee_id").eq("tee_id", teeId).order("hole_number"),
    admin.from("v2_composition_tee_mappings").select("tee_id").neq("tee_id", teeId),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const compositionTeeIds = [...new Set((allComposition || []).map((r) => r.tee_id))];
  return NextResponse.json({ mappings: data || [], compositionTeeIds });
}

export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { tee_id, mappings } = await request.json();
  if (!tee_id || !mappings || !Array.isArray(mappings)) {
    return NextResponse.json({ error: "tee_id and mappings array required" }, { status: 400 });
  }

  const admin = v2AdminClient();
  const gate = await courseEditGateByTee(admin, tee_id, userId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const rows = mappings.map((m: { hole_number: number; source_tee_id: string }) => ({
    tee_id, hole_number: m.hole_number, source_tee_id: m.source_tee_id,
  }));
  const { error } = await admin.from("v2_composition_tee_mappings").upsert(rows, { onConflict: "tee_id,hole_number" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { tee_id } = await request.json();
  if (!tee_id) return NextResponse.json({ error: "tee_id required" }, { status: 400 });

  const admin = v2AdminClient();
  const gate = await courseEditGateByTee(admin, tee_id, userId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { error } = await admin.from("v2_composition_tee_mappings").delete().eq("tee_id", tee_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
