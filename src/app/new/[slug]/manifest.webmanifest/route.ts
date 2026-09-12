import { NextResponse } from "next/server";
import { v2AdminClient } from "@/lib/v2/supabase";

/**
 * Per-org PWA manifest. Makes /new/<slug> installable as its own app (distinct
 * `id`/`start_url`/`scope`) so e.g. golfapalooza.app/new/golfapalooza installs as
 * "Golfapalooza" and launches straight into that org's home. Scoped entirely to
 * /new — the legacy site keeps using /manifest.json unchanged.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const admin = v2AdminClient();
  const { data: org } = await admin
    .from("v2_organizations")
    .select("name, primary_color, logo_url")
    .eq("slug", slug)
    .maybeSingle();

  const name = org?.name || "Golfapalooza";
  const theme = org?.primary_color || "#0a5c36";
  const base = `/new/${slug}`;

  // Per-tenant icons: when the org has a logo, generate square app icons from it
  // (dynamic icon route). Otherwise fall back to the default app icons. Each org
  // therefore installs with its OWN icon.
  const icons = org?.logo_url
    ? [
        { src: `${base}/icon?size=192`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `${base}/icon?size=192&maskable=1`, sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: `${base}/icon?size=512`, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: `${base}/icon?size=512&maskable=1`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ]
    : [
        { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ];

  const manifest = {
    id: base,
    name,
    short_name: name.length > 12 ? name.slice(0, 12).trim() : name,
    description: `${name} — live scoring, planning, and updates`,
    start_url: base,
    scope: base,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: theme,
    orientation: "portrait-primary",
    icons,
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
