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

/**
 * @swagger
 * /api/admin/contests/participants:
 *   get:
 *     summary: List participants for a contest
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: contest_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contest participants
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contest_id");

  if (!contestId) {
    return NextResponse.json(
      { error: "contest_id is required" },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  const { data: participants, error } = await adminClient
    .from("contest_participants")
    .select("user_id, user:users(id, display_name, full_name, avatar_url)")
    .eq("contest_id", contestId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ participants });
}

/**
 * @swagger
 * /api/admin/contests/participants:
 *   post:
 *     summary: Add participant to a contest
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Participant added to contest
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contest_id, user_id } = await request.json();

    if (!contest_id || !user_id) {
      return NextResponse.json(
        { error: "contest_id and user_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from("contest_participants")
      .upsert({ contest_id, user_id }, { onConflict: "contest_id,user_id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Add contest participant error:", error);
    return NextResponse.json(
      { error: "Failed to add contest participant" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/contests/participants:
 *   put:
 *     summary: Bulk set participants for a contest
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Contest participants updated
 *       401:
 *         description: Unauthorized
 */
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contest_id, user_ids } = await request.json();

    if (!contest_id || !Array.isArray(user_ids)) {
      return NextResponse.json(
        { error: "contest_id and user_ids array are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Remove all current participants
    await adminClient
      .from("contest_participants")
      .delete()
      .eq("contest_id", contest_id);

    // Add new participants
    if (user_ids.length > 0) {
      const entries = user_ids.map((uid: string) => ({
        contest_id,
        user_id: uid,
      }));

      const { error } = await adminClient
        .from("contest_participants")
        .insert(entries);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Bulk update contest participants error:", error);
    return NextResponse.json(
      { error: "Failed to update contest participants" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/contests/participants:
 *   delete:
 *     summary: Remove participant from a contest
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Participant removed from contest
 *       401:
 *         description: Unauthorized
 */
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contest_id, user_id } = await request.json();

    if (!contest_id || !user_id) {
      return NextResponse.json(
        { error: "contest_id and user_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from("contest_participants")
      .delete()
      .eq("contest_id", contest_id)
      .eq("user_id", user_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove contest participant error:", error);
    return NextResponse.json(
      { error: "Failed to remove contest participant" },
      { status: 500 }
    );
  }
}
