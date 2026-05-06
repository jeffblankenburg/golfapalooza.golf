import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * @swagger
 * /api/loozers/{userId}/descendants:
 *   get:
 *     summary: Get a Loozer plus their descendant subtree (for the profile family-tree accordion)
 *     tags: [Loozers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of Loozers — the requested user followed by every descendant
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // Pull every non-system user. We intentionally do NOT filter is_financial_only
  // here — a financial-only Loozer can sit in the middle of a sponsorship chain,
  // and dropping them at the SQL layer would orphan every descendant below them.
  const { data: users } = await adminClient
    .from("users")
    .select("id, display_name, full_name, avatar_url, sponsor_id, is_founder")
    .eq("is_system", false);

  const all = users || [];
  const root = all.find((u) => u.id === userId);
  if (!root) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const childrenByParent = new Map<string, typeof all>();
  for (const u of all) {
    if (!u.sponsor_id) continue;
    if (!childrenByParent.has(u.sponsor_id)) childrenByParent.set(u.sponsor_id, []);
    childrenByParent.get(u.sponsor_id)!.push(u);
  }

  const descendants: typeof all = [root];
  const queue: string[] = [root.id];
  const seen = new Set<string>([root.id]);
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const kids = childrenByParent.get(parentId) || [];
    for (const kid of kids) {
      if (seen.has(kid.id)) continue;
      seen.add(kid.id);
      descendants.push(kid);
      queue.push(kid.id);
    }
  }

  return NextResponse.json({ loozers: descendants });
}
