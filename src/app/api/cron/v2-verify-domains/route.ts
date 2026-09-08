import { NextRequest, NextResponse } from "next/server";
import { v2AdminClient } from "@/lib/v2/supabase";
import { checkDomainStatus, removeDomainFromVercel, vercelConfigured } from "@/lib/v2/vercel";

/**
 * Cron: re-check pending v2 custom domains against Vercel and clean up stragglers.
 * Bearer-authed (CRON_SECRET). For each unverified domain:
 *   - if Vercel now reports verified && !misconfigured → mark verified (goes live);
 *   - else if it's been pending > 7 days → detach from Vercel + delete the row.
 * No-ops safely when the Vercel integration isn't configured.
 */
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = v2AdminClient();
  const { data: pending } = await admin
    .from("v2_org_domains")
    .select("id, hostname, created_at")
    .eq("verified", false);

  let verified = 0;
  let removed = 0;
  let checked = 0;
  const now = Date.now();

  for (const d of pending || []) {
    if (vercelConfigured()) {
      checked++;
      const status = await checkDomainStatus(d.hostname);
      if (status.verified && !status.misconfigured) {
        await admin
          .from("v2_org_domains")
          .update({ verified: true, misconfigured: false, last_checked_at: new Date().toISOString() })
          .eq("id", d.id);
        verified++;
        continue;
      }
      await admin
        .from("v2_org_domains")
        .update({ misconfigured: status.misconfigured, last_checked_at: new Date().toISOString() })
        .eq("id", d.id);
    }

    // Clean up domains left pending too long.
    if (d.created_at && now - new Date(d.created_at).getTime() > STALE_MS) {
      await removeDomainFromVercel(d.hostname);
      await admin.from("v2_org_domains").delete().eq("id", d.id);
      removed++;
    }
  }

  return NextResponse.json({ checked, verified, removed, total: pending?.length || 0 });
}
