/**
 * Vercel Domains API wrapper for v2 custom domains. Env-guarded: if VERCEL_TOKEN
 * isn't set, the feature degrades gracefully (domains stay pending, generic DNS
 * instructions shown) — the app never breaks for lack of the integration.
 *
 * Env:
 *   VERCEL_TOKEN       — API token scoped to the team
 *   VERCEL_PROJECT_ID  — this project (prj_…) or its name
 *   VERCEL_TEAM_ID     — team_… (this app runs under a team)
 */

const API = "https://api.vercel.com";
const TOKEN = process.env.VERCEL_TOKEN;
const PROJECT = process.env.VERCEL_PROJECT_ID;
const TEAM = process.env.VERCEL_TEAM_ID;

export function vercelConfigured(): boolean {
  return !!(TOKEN && PROJECT && TEAM);
}

function teamQuery(): string {
  return TEAM ? `?teamId=${TEAM}` : "";
}
function headers() {
  return { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
}

export interface VercelVerificationRecord {
  type: string; // e.g. "TXT"
  domain: string;
  value: string;
  reason?: string;
}

interface AddResult {
  ok: boolean;
  verified: boolean;
  verification: VercelVerificationRecord[];
  error?: string;
}

/** Register a hostname on the Vercel project. */
export async function addDomainToVercel(hostname: string): Promise<AddResult> {
  if (!vercelConfigured()) {
    return { ok: false, verified: false, verification: [], error: "not_configured" };
  }
  const res = await fetch(`${API}/v10/projects/${PROJECT}/domains${teamQuery()}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name: hostname }),
  });
  const data = await res.json().catch(() => ({}));
  // Already attached to this project is a benign success for our purposes.
  if (!res.ok && data?.error?.code !== "domain_already_in_use") {
    return { ok: false, verified: false, verification: [], error: data?.error?.message || "add_failed" };
  }
  return {
    ok: true,
    verified: !!data.verified,
    verification: Array.isArray(data.verification) ? data.verification : [],
  };
}

/** Remove a hostname from the Vercel project (best-effort). */
export async function removeDomainFromVercel(hostname: string): Promise<void> {
  if (!vercelConfigured()) return;
  await fetch(`${API}/v9/projects/${PROJECT}/domains/${hostname}${teamQuery()}`, {
    method: "DELETE",
    headers: headers(),
  }).catch(() => {});
}

export interface DomainStatus {
  verified: boolean;
  misconfigured: boolean;
  verification: VercelVerificationRecord[];
}

/**
 * Current status: routing DNS correct (`!misconfigured`) AND ownership verified.
 * Combines the project verify call with the domain-config (DNS) check.
 */
export async function checkDomainStatus(hostname: string): Promise<DomainStatus> {
  if (!vercelConfigured()) {
    return { verified: false, misconfigured: true, verification: [] };
  }
  // Kick the ownership verification (no-op if already verified).
  const verifyRes = await fetch(
    `${API}/v9/projects/${PROJECT}/domains/${hostname}/verify${teamQuery()}`,
    { method: "POST", headers: headers() }
  ).catch(() => null);
  const verifyData = verifyRes ? await verifyRes.json().catch(() => ({})) : {};

  // DNS routing check.
  const cfgRes = await fetch(`${API}/v6/domains/${hostname}/config${teamQuery()}`, {
    headers: headers(),
  }).catch(() => null);
  const cfgData = cfgRes ? await cfgRes.json().catch(() => ({})) : {};

  return {
    verified: !!verifyData.verified,
    misconfigured: cfgData.misconfigured !== false, // default to true if unknown
    verification: Array.isArray(verifyData.verification) ? verifyData.verification : [],
  };
}
