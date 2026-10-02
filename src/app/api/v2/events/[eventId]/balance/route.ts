import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";
import { loadMemberBalance } from "@/lib/v2/balances";

/**
 * The caller's own balance for an event (#214) — derived charges (Trip Cost + their
 * selected Options) + ledger charges, minus ledger payments. Self only; a member
 * never sees anyone else's money. Membership-gated.
 */
export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  const { data: event } = await admin.from("v2_events").select("id, org_id").eq("id", eventId).maybeSingle();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (!(await isOrgMember(admin, userId, event.org_id as string))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  return NextResponse.json({ balance: await loadMemberBalance(admin, eventId, userId) });
}
