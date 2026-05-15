import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";
import { loadActivePollsForUser } from "@/lib/polls";

/**
 * @swagger
 * /api/polls/active:
 *   get:
 *     summary: List currently-active polls visible to the current user
 *     tags: [Polls]
 *     description: |
 *       Returns every active poll the current user is eligible to see, each
 *       with the user's existing response (if any). Multiple active polls
 *       are allowed; the home page stacks up to ~3 banners.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const adminClient = createAdminClient();
  const polls = await loadActivePollsForUser(adminClient, effectiveUserId);

  return NextResponse.json({ polls });
}
