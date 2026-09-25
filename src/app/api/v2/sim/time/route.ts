import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isAnyOrgAdmin } from "@/lib/v2/orgs";
import { SIM_AT_COOKIE, makeSimAtCookie } from "@/lib/v2/simulator";

/**
 * Time simulator (dev/admin). POST { at } to override "now" (ISO datetime);
 * DELETE to return to real time. Gated to org owners/admins. The cookie is signed
 * (see `makeSimAtCookie`) so it can't be forged by a non-admin.
 */
export async function POST(request: Request) {
  const { realUserId } = await v2GetUser(request);
  if (!realUserId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await isAnyOrgAdmin(v2AdminClient(), realUserId))) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  let body: { at?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const at = (body.at || "").trim();
  const d = new Date(at);
  if (!at || isNaN(d.getTime())) return NextResponse.json({ error: "A valid datetime is required" }, { status: 400 });

  const res = NextResponse.json({ ok: true, at: d.toISOString() });
  res.cookies.set(SIM_AT_COOKIE, makeSimAtCookie(d.toISOString()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}

export async function DELETE(request: Request) {
  const { realUserId } = await v2GetUser(request);
  if (!realUserId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SIM_AT_COOKIE);
  return res;
}
