import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { findOverlappingPolls } from "@/lib/polls";

/**
 * @swagger
 * /api/admin/polls/conflicts:
 *   get:
 *     summary: Check for poll window conflicts
 *     tags: [Admin, Polls]
 *     description: |
 *       Query: ?starts_at=ISO&ends_at=ISO&exclude_id=uuid
 *       Returns { conflicts: [...], next_free_start: ISO|null } where
 *       next_free_start is the earliest time after the latest conflicting
 *       end that the requested window could start.
 */
export async function GET(request: NextRequest) {
  const admin = await checkIsAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const starts_at = searchParams.get("starts_at");
  const ends_at = searchParams.get("ends_at");
  const exclude_id = searchParams.get("exclude_id") || undefined;

  if (!starts_at || !ends_at) {
    return NextResponse.json(
      { error: "starts_at and ends_at are required" },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();
  const conflicts = await findOverlappingPolls(adminClient, starts_at, ends_at, exclude_id);

  let next_free_start: string | null = null;
  if (conflicts.length > 0) {
    const latestEnd = conflicts.reduce((max, c) => {
      const t = new Date(c.ends_at).getTime();
      return t > max ? t : max;
    }, 0);
    next_free_start = new Date(latestEnd).toISOString();
  }

  return NextResponse.json({ conflicts, next_free_start });
}
