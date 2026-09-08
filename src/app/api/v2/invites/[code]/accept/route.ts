import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { toE164 } from "@/lib/v2/phone";
import { cleanProfileFields, displayNameFrom, type ProfileFields } from "@/lib/v2/profile";

/**
 * POST /api/v2/invites/[code]/accept — redeem a phone-bound, single-use invite.
 * The caller must be authenticated AND their verified phone must match the
 * invite's target number (prevents link forwarding). Creates the membership at
 * the invite's role and marks the invite consumed. A brand-new user passes a
 * display_name so we can provision their v2_profiles row.
 * Auth: bearer (native) or cookie (web).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { userId, supabase } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  let body: ProfileFields;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const admin = v2AdminClient();
  const { data: invite } = await admin
    .from("v2_invites")
    .select(
      "id, org_id, role, phone, max_uses, uses, expires_at, redeemed_at, first_name, last_name, nickname, birthdate, zip"
    )
    .eq("code", code)
    .maybeSingle();
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  const expired = !!invite.expires_at && new Date(invite.expires_at).getTime() < Date.now();
  const used = !!invite.redeemed_at || (invite.max_uses != null && invite.uses >= invite.max_uses);
  if (expired) return NextResponse.json({ error: "This invite has expired" }, { status: 410 });
  if (used) return NextResponse.json({ error: "This invite has already been used" }, { status: 410 });

  // Phone-bound: the verified caller must be the invited number.
  const invitePhone = toE164(invite.phone || "");
  const userPhone = toE164(authUser?.phone || "");
  if (!invitePhone || !userPhone || invitePhone !== userPhone) {
    return NextResponse.json(
      { error: "This invite was sent to a different phone number." },
      { status: 403 }
    );
  }

  // Ensure a profile exists. Fields come from the joiner (body) and fall back to
  // whatever the inviter prefilled on the invite. first + last are required.
  const { data: profile } = await admin
    .from("v2_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) {
    const supplied = cleanProfileFields(body);
    const fields = {
      first_name: supplied.first_name ?? invite.first_name ?? null,
      last_name: supplied.last_name ?? invite.last_name ?? null,
      nickname: supplied.nickname ?? invite.nickname ?? null,
      birthdate: supplied.birthdate ?? invite.birthdate ?? null,
      zip: supplied.zip ?? invite.zip ?? null,
    };
    if (!fields.first_name || !fields.last_name) {
      return NextResponse.json({ error: "name_required" }, { status: 400 });
    }
    const { error: pErr } = await admin.from("v2_profiles").insert({
      id: userId,
      display_name: displayNameFrom(fields),
      phone: userPhone,
      ...fields,
    });
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  // Create membership (idempotent if they're somehow already in).
  const { error: mErr } = await admin.from("v2_memberships").upsert(
    { org_id: invite.org_id, user_id: userId, role: invite.role, status: "active" },
    { onConflict: "org_id,user_id", ignoreDuplicates: true }
  );
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  await admin
    .from("v2_invites")
    .update({ uses: (invite.uses || 0) + 1, redeemed_by: userId, redeemed_at: new Date().toISOString() })
    .eq("id", invite.id);

  const { data: org } = await admin
    .from("v2_organizations")
    .select("slug")
    .eq("id", invite.org_id)
    .single();

  return NextResponse.json({ ok: true, slug: org?.slug || null });
}
