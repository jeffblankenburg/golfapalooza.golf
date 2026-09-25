import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { canSimulate, SIM_USER_COOKIE } from "@/lib/v2/simulator";

/**
 * User simulator (dev/admin). POST { userId } to view the app AS that member;
 * DELETE to exit. Gated: the real user must be an owner/admin of an org the target
 * belongs to (re-verified here AND on every request in `resolveEffectiveUser`).
 */
export async function POST(request: Request) {
  const { realUserId } = await v2GetUser(request);
  if (!realUserId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const target = body.userId;
  if (!target || typeof target !== "string") return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const ok = await canSimulate(v2AdminClient(), realUserId, target);
  if (!ok) return NextResponse.json({ error: "You can only simulate members of a group you administer" }, { status: 403 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SIM_USER_COOKIE, target, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // an 8-hour dev session
  });
  return res;
}

export async function DELETE(request: Request) {
  const { realUserId } = await v2GetUser(request);
  if (!realUserId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SIM_USER_COOKIE);
  return res;
}
