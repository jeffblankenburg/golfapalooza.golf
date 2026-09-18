import { NextResponse } from "next/server";
import { v2AdminClient } from "@/lib/v2/supabase";

/**
 * GET /api/v2/invites/[code] — public preview for the join page. Returns just
 * enough to render "Join {org}" and validity; never leaks the target phone.
 * Looked up via the service role since the invitee isn't a member yet.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const admin = v2AdminClient();
  const { data: invite } = await admin
    .from("v2_invites")
    .select(
      "id, org_id, role, max_uses, uses, expires_at, redeemed_at, first_name, last_name, nickname, birthdate, zip, org:v2_organizations(name, slug, logo_url)"
    )
    .eq("code", code)
    .maybeSingle();

  if (!invite) return NextResponse.json({ valid: false, reason: "not_found" });

  const org = Array.isArray(invite.org) ? invite.org[0] : invite.org;
  const expired = !!invite.expires_at && new Date(invite.expires_at).getTime() < Date.now();
  const used = !!invite.redeemed_at || (invite.max_uses != null && invite.uses >= invite.max_uses);

  return NextResponse.json({
    valid: !expired && !used,
    reason: expired ? "expired" : used ? "used" : undefined,
    orgName: (org as { name?: string })?.name || "a golf group",
    orgSlug: (org as { slug?: string })?.slug || null,
    orgLogo: (org as { logo_url?: string | null })?.logo_url || null,
    prefill: {
      first_name: invite.first_name,
      last_name: invite.last_name,
      nickname: invite.nickname,
      birthdate: invite.birthdate,
      zip: invite.zip,
    },
  });
}
