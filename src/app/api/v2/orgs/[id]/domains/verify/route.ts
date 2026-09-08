import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { checkDomainStatus } from "@/lib/v2/vercel";

/**
 * POST /api/v2/orgs/[id]/domains/verify — re-check one domain against Vercel now
 * (the "Check status" button). Owner/admin only. Flips verified=true when Vercel
 * reports verified && !misconfigured. Auth: bearer (native) or cookie (web).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, id))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let body: { domain_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { data: row } = await admin
    .from("v2_org_domains")
    .select("id, hostname")
    .eq("id", body.domain_id)
    .eq("org_id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

  const status = await checkDomainStatus(row.hostname);
  const verified = status.verified && !status.misconfigured;

  await admin
    .from("v2_org_domains")
    .update({
      verified,
      misconfigured: status.misconfigured,
      verification: status.verification.length ? status.verification : null,
      last_checked_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  return NextResponse.json({ verified, misconfigured: status.misconfigured });
}
