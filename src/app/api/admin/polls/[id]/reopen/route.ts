import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/polls/{id}/reopen:
 *   post:
 *     summary: Reopen a closed poll with a new ends_at
 *     tags: [Admin, Polls]
 *     description: |
 *       Body: { ends_at: ISO }. Existing responses are preserved. No launch
 *       notification is sent on reopen.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await checkIsAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { ends_at } = await request.json();

  if (!ends_at) {
    return NextResponse.json({ error: "ends_at is required" }, { status: 400 });
  }

  const newEnd = new Date(ends_at);
  const now = new Date();
  if (newEnd <= now) {
    return NextResponse.json(
      { error: "ends_at must be in the future" },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  const { data: poll } = await adminClient
    .from("polls")
    .select("id, status, starts_at")
    .eq("id", id)
    .maybeSingle();

  if (!poll) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (poll.status !== "closed") {
    return NextResponse.json(
      { error: `Cannot reopen poll with status '${poll.status}'` },
      { status: 400 }
    );
  }

  const newStart = now.toISOString();
  const { error } = await adminClient
    .from("polls")
    .update({ status: "active", starts_at: newStart, ends_at })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status: "active", starts_at: newStart, ends_at });
}
