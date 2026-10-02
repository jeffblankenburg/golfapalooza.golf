import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isSystemAdmin } from "@/lib/v2/orgs";

/**
 * Platform system-admin management (GH #178). System admins can grant/revoke the
 * flag on any profile. Gated: the REAL caller must already be a system admin (never
 * the simulated user — escalation guard). Service-role writes bypass RLS by design.
 *
 *   POST   { userId }  → grant is_system_admin
 *   DELETE { userId }  → revoke is_system_admin (refused if it empties the tier)
 */
async function requireSystemAdmin(request: Request) {
  const { realUserId } = await v2GetUser(request);
  if (!realUserId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = v2AdminClient();
  if (!(await isSystemAdmin(admin, realUserId))) {
    return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) };
  }
  return { admin, realUserId };
}

async function readUserId(request: Request): Promise<string | null> {
  try {
    const body = (await request.json()) as { userId?: string };
    return typeof body.userId === "string" && body.userId ? body.userId : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const gate = await requireSystemAdmin(request);
  if (gate.error) return gate.error;
  const { admin } = gate;

  const userId = await readUserId(request);
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  // The target must have a profile (a real person who has signed in at least once).
  const { data: prof } = await admin.from("v2_profiles").select("id").eq("id", userId).maybeSingle();
  if (!prof) return NextResponse.json({ error: "No such member" }, { status: 404 });

  const { error } = await admin.from("v2_profiles").update({ is_system_admin: true }).eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const gate = await requireSystemAdmin(request);
  if (gate.error) return gate.error;
  const { admin } = gate;

  const userId = await readUserId(request);
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  // Lockout guard: never let the platform end up with zero system admins.
  const { data: current } = await admin
    .from("v2_profiles")
    .select("id")
    .eq("is_system_admin", true);
  const ids = (current || []).map((r) => r.id);
  if (!ids.includes(userId)) return NextResponse.json({ error: "Not a system admin" }, { status: 400 });
  if (ids.length <= 1) {
    return NextResponse.json({ error: "Can't remove the last system admin" }, { status: 409 });
  }

  const { error } = await admin.from("v2_profiles").update({ is_system_admin: false }).eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
