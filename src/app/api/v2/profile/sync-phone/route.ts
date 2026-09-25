import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";

/**
 * Mirror the authenticated user's verified auth phone into their v2_profiles.phone.
 * Called after a client-side OTP-verified phone change (updateUser + verifyOtp).
 * Reads the phone from auth (authoritative) rather than trusting a client value,
 * and refuses while simulating (phone changes act on the real live session).
 */
export async function POST(request: Request) {
  const { realUserId, simulating } = await v2GetUser(request);
  if (!realUserId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (simulating) return NextResponse.json({ error: "Can't change phone while simulating" }, { status: 403 });

  const admin = v2AdminClient();
  const { data: authData, error: authErr } = await admin.auth.admin.getUserById(realUserId);
  if (authErr || !authData?.user) return NextResponse.json({ error: "Could not read account" }, { status: 500 });
  const phone = authData.user.phone || null;

  const { error } = await admin
    .from("v2_profiles")
    .update({ phone, updated_at: new Date().toISOString() })
    .eq("id", realUserId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ phone });
}
