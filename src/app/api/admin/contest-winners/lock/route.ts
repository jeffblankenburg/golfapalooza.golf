import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";
import { clearWinnersForContest, resolveAllForContest } from "@/lib/winners/resolve";

// PUT - Lock or unlock a contest for winner changes
export async function PUT(request: Request) {
  const admin = await checkPermissionAccess("manage_calcutta");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contest_id, action } = await request.json();

    if (!contest_id || !action) {
      return NextResponse.json({ error: "contest_id and action are required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    if (action === "lock") {
      const { error } = await adminClient
        .from("contests")
        .update({
          winners_locked_at: new Date().toISOString(),
          winners_locked_by: admin.id,
        })
        .eq("id", contest_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "unlock") {
      // Clear winners for prizes linked to this contest
      await clearWinnersForContest(adminClient, contest_id);

      // Remove the lock
      const { error } = await adminClient
        .from("contests")
        .update({
          winners_locked_at: null,
          winners_locked_by: null,
        })
        .eq("id", contest_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "resolve-if-champion") {
      // Try to resolve winners for this contest if it has a completed bracket
      const results = await resolveAllForContest(adminClient, contest_id, admin.id);
      return NextResponse.json({ success: true, resolved: results.filter((r) => r.resolved).length });
    }

    return NextResponse.json({ error: "Invalid action. Use 'lock' or 'unlock'." }, { status: 400 });
  } catch (error) {
    console.error("Lock contest error:", error);
    return NextResponse.json({ error: "Failed to update lock" }, { status: 500 });
  }
}
