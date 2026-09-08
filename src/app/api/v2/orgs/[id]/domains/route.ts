import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin, normalizeHostname } from "@/lib/v2/orgs";
import { addDomainToVercel, removeDomainFromVercel } from "@/lib/v2/vercel";

/**
 * Custom-domain management for an org. Owner/admin only. Add-first: on POST we
 * register the host on the Vercel project (so Vercel can route it + issue TLS)
 * and store any ownership challenge; verification is a later step (verify route
 * + cron). Auth: bearer (native) or cookie (web) via v2GetUser.
 */

async function guard(request: Request, orgId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: "Not authenticated", status: 401 as const };
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) {
    return { error: "Not allowed", status: 403 as const };
  }
  return { admin };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const { data, error } = await g.admin
    .from("v2_org_domains")
    .select("id, hostname, verified, is_primary, misconfigured, verification, last_checked_at")
    .eq("org_id", id)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ domains: data || [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: { hostname?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const hostname = normalizeHostname(body.hostname || "");
  if (!hostname) {
    return NextResponse.json({ error: "Enter a valid domain, e.g. golf.yourclub.com" }, { status: 400 });
  }

  // Register with Vercel first (source of truth for records + issues the cert).
  const vercel = await addDomainToVercel(hostname);
  if (!vercel.ok && vercel.error && vercel.error !== "not_configured") {
    return NextResponse.json({ error: vercel.error }, { status: 502 });
  }

  const { data, error } = await g.admin
    .from("v2_org_domains")
    .insert({
      org_id: id,
      hostname,
      verified: vercel.verified,
      misconfigured: !vercel.verified,
      verification: vercel.verification.length ? vercel.verification : null,
      last_checked_at: new Date().toISOString(),
    })
    .select("id, hostname, verified, is_primary, misconfigured, verification, last_checked_at")
    .single();
  if (error) {
    // We added it to Vercel but couldn't record it — roll back the Vercel side.
    if (error.code === "23505") {
      return NextResponse.json({ error: "That domain is already in use" }, { status: 409 });
    }
    await removeDomainFromVercel(hostname);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ domain: data });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: { domain_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.domain_id) {
    return NextResponse.json({ error: "domain_id required" }, { status: 400 });
  }

  // Look up the hostname so we can detach it from Vercel too.
  const { data: row } = await g.admin
    .from("v2_org_domains")
    .select("hostname")
    .eq("id", body.domain_id)
    .eq("org_id", id)
    .maybeSingle();

  const { error } = await g.admin
    .from("v2_org_domains")
    .delete()
    .eq("id", body.domain_id)
    .eq("org_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (row?.hostname) await removeDomainFromVercel(row.hostname);
  return NextResponse.json({ ok: true });
}
