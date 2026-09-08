import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin, genInviteCode } from "@/lib/v2/orgs";
import { toE164 } from "@/lib/v2/phone";
import { cleanProfileFields, type ProfileFields } from "@/lib/v2/profile";
import { sendSms } from "@/lib/v2/sms";

const EXPIRY_DAYS = 14;

async function guard(request: Request, orgId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: "Not authenticated", status: 401 as const };
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) {
    return { error: "Not allowed", status: 403 as const };
  }
  return { admin, userId };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const { data } = await g.admin
    .from("v2_invites")
    .select("id, phone, role, first_name, last_name, nickname, created_at, expires_at, redeemed_at")
    .eq("org_id", id)
    .is("redeemed_at", null)
    .order("created_at", { ascending: false });
  return NextResponse.json({ invites: data || [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: { phone?: string; role?: string } & ProfileFields;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const phone = toE164(body.phone || "");
  if (!phone) {
    return NextResponse.json({ error: "Enter a valid mobile number" }, { status: 400 });
  }
  const role = body.role === "admin" ? "admin" : "member"; // never invite straight to owner
  const fields = cleanProfileFields(body); // first/last required, rest optional
  if (!fields.first_name || !fields.last_name) {
    return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
  }

  const { data: org } = await g.admin
    .from("v2_organizations")
    .select("name")
    .eq("id", id)
    .single();

  const code = genInviteCode();
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: invite, error } = await g.admin
    .from("v2_invites")
    .insert({
      org_id: id,
      code,
      phone,
      role,
      max_uses: 1,
      uses: 0,
      expires_at: expiresAt,
      created_by: g.userId,
      ...fields,
    })
    .select("id, phone, role, created_at, expires_at")
    .single();
  if (error || !invite) {
    return NextResponse.json({ error: error?.message || "Could not create invite" }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const link = `${origin}/new/join/${code}`;
  const orgName = org?.name || "a golf group";
  const sms = await sendSms(phone, `You're invited to join ${orgName}. Tap to accept: ${link}`);

  return NextResponse.json({
    invite,
    link,
    smsSent: sms.ok,
    smsError: sms.ok ? undefined : sms.error,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: { invite_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.invite_id) {
    return NextResponse.json({ error: "invite_id required" }, { status: 400 });
  }
  const { error } = await g.admin
    .from("v2_invites")
    .delete()
    .eq("id", body.invite_id)
    .eq("org_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
