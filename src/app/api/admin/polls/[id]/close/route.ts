import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/polls/{id}/close:
 *   post:
 *     summary: Close an active poll immediately
 *     tags: [Admin, Polls]
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await checkIsAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const adminClient = createAdminClient();

  const { data: poll } = await adminClient
    .from("polls")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (!poll) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (poll.status !== "active" && poll.status !== "scheduled") {
    return NextResponse.json(
      { error: `Cannot close poll with status '${poll.status}'` },
      { status: 400 }
    );
  }

  const { error } = await adminClient
    .from("polls")
    .update({ status: "closed", ends_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status: "closed" });
}
