/** Client-safe DNS helpers (no secrets), shared by the UI and the Vercel wrapper. */

export interface RoutingRecord {
  type: "A" | "CNAME";
  name: string; // "@" for apex, or the subdomain label
  value: string;
}

/** Apex (example.com) → A record; subdomain (golf.example.com) → CNAME. */
export function routingRecordFor(hostname: string): RoutingRecord {
  const labels = hostname.split(".");
  const isApex = labels.length <= 2;
  return isApex
    ? { type: "A", name: "@", value: "76.76.21.21" }
    : { type: "CNAME", name: labels[0], value: "cname.vercel-dns.com" };
}
