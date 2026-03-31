import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function checkIsAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) return null;
  return user;
}

export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contest_id, action } = await request.json();

    if (!contest_id || !action) {
      return NextResponse.json(
        { error: "contest_id and action are required" },
        { status: 400 }
      );
    }

    const validActions = ["close", "open", "verify", "unverify"];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${validActions.join(", ")}` },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Fetch current contest state
    const { data: contest } = await adminClient
      .from("contests")
      .select("id, scoring_closed_at, verified_at")
      .eq("id", contest_id)
      .single();

    if (!contest) {
      return NextResponse.json({ error: "Contest not found" }, { status: 404 });
    }

    if (action === "close") {
      const { error } = await adminClient
        .from("contests")
        .update({
          scoring_closed_at: new Date().toISOString(),
          scoring_closed_by: admin.id,
        })
        .eq("id", contest_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (action === "open") {
      if (contest.verified_at) {
        return NextResponse.json(
          { error: "Cannot reopen scoring while contest is verified. Unverify first." },
          { status: 400 }
        );
      }

      const { error } = await adminClient
        .from("contests")
        .update({
          scoring_closed_at: null,
          scoring_closed_by: null,
        })
        .eq("id", contest_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (action === "verify") {
      if (!contest.scoring_closed_at) {
        return NextResponse.json(
          { error: "Must close live scoring before verifying." },
          { status: 400 }
        );
      }

      const { error } = await adminClient
        .from("contests")
        .update({
          verified_at: new Date().toISOString(),
          verified_by: admin.id,
        })
        .eq("id", contest_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (action === "unverify") {
      const { error } = await adminClient
        .from("contests")
        .update({
          verified_at: null,
          verified_by: null,
        })
        .eq("id", contest_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Scoring lifecycle error:", error);
    return NextResponse.json(
      { error: "Failed to update scoring lifecycle" },
      { status: 500 }
    );
  }
}
