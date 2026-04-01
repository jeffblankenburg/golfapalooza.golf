import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { team_id, action } = await request.json();

    if (!team_id || !action) {
      return NextResponse.json(
        { error: "team_id and action are required" },
        { status: 400 }
      );
    }

    if (action !== "verify" && action !== "unverify") {
      return NextResponse.json(
        { error: "action must be 'verify' or 'unverify'" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    if (action === "verify") {
      const { error } = await adminClient
        .from("scramble_teams")
        .update({
          verified_at: new Date().toISOString(),
          verified_by: admin.id,
        })
        .eq("id", team_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      const { error } = await adminClient
        .from("scramble_teams")
        .update({
          verified_at: null,
          verified_by: null,
        })
        .eq("id", team_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Verify team error:", error);
    return NextResponse.json(
      { error: "Failed to update verification" },
      { status: 500 }
    );
  }
}
