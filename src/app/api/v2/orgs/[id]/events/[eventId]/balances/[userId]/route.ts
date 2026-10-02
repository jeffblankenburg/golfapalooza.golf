import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { loadMemberBalance } from "@/lib/v2/balances";

/** One member's full balance breakdown, for the admin Balances drill-in (#214). Admins only. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; eventId: string; userId: string }> }) {
  const { id: orgId, eventId, userId: targetId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  return NextResponse.json({ balance: await loadMemberBalance(admin, eventId, targetId) });
}
