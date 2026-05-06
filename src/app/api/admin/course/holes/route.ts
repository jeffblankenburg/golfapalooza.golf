import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

// PUT - Batch update hole data (par, handicap, yards, hole_name).
//
// par/handicap_index/yards are tee-specific and updated by id.
// hole_name is a property of the hole itself, so it's mirrored to every tee
// row sharing the same (course_id, hole_number).
export async function PUT(request: Request) {
  const admin = await checkPermissionAccess("manage_facilities");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { holes } = body;

    if (!holes || !Array.isArray(holes)) {
      return NextResponse.json(
        { error: "holes array is required" },
        { status: 400 }
      );
    }

    type HoleUpdate = {
      id: string;
      par?: number;
      handicap_index?: number;
      yards?: number;
      hole_name?: string | null;
    };

    const adminClient = createAdminClient();
    const incoming: HoleUpdate[] = holes.filter((h: HoleUpdate) => h.id);

    // Per-id updates for tee-specific fields. Only update fields that were
    // explicitly sent — callers are free to push just hole_name (e.g. the
    // drawer-driven name editor) without clobbering the rest.
    const teeFieldUpdates = await Promise.all(
      incoming.map((hole) => {
        const updates: Record<string, number> = {};
        if (typeof hole.par === "number") updates.par = hole.par;
        if (typeof hole.handicap_index === "number") updates.handicap_index = hole.handicap_index;
        if (typeof hole.yards === "number") updates.yards = hole.yards;
        if (Object.keys(updates).length === 0) {
          return Promise.resolve({ error: null });
        }
        return adminClient
          .from("course_holes")
          .update(updates)
          .eq("id", hole.id);
      })
    );

    const teeFail = teeFieldUpdates.find((r) => r.error);
    if (teeFail?.error) {
      return NextResponse.json({ error: teeFail.error.message }, { status: 500 });
    }

    // Look up (course_id, hole_number) for each id, then mirror hole_name
    // across every tee row for that hole.
    const ids = incoming.map((h) => h.id);
    if (ids.length > 0) {
      const { data: rows, error: lookupErr } = await adminClient
        .from("course_holes")
        .select("id, course_id, hole_number")
        .in("id", ids);

      if (lookupErr) {
        return NextResponse.json({ error: lookupErr.message }, { status: 500 });
      }

      const byId = new Map(rows?.map((r) => [r.id, r]) ?? []);
      const seen = new Set<string>();
      const nameUpdates = [];

      for (const hole of incoming) {
        // Skip when hole_name wasn't included — caller is only updating
        // tee-specific fields and we shouldn't wipe an existing name.
        if (!Object.prototype.hasOwnProperty.call(hole, "hole_name")) continue;
        const row = byId.get(hole.id);
        if (!row) continue;
        const key = `${row.course_id}|${row.hole_number}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const trimmed =
          typeof hole.hole_name === "string" ? hole.hole_name.trim() : "";
        const value = trimmed.length > 0 ? trimmed : null;

        nameUpdates.push(
          adminClient
            .from("course_holes")
            .update({ hole_name: value })
            .eq("course_id", row.course_id)
            .eq("hole_number", row.hole_number)
        );
      }

      const nameResults = await Promise.all(nameUpdates);
      const nameFail = nameResults.find((r) => r.error);
      if (nameFail?.error) {
        return NextResponse.json({ error: nameFail.error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update holes error:", error);
    return NextResponse.json(
      { error: "Failed to update holes" },
      { status: 500 }
    );
  }
}
