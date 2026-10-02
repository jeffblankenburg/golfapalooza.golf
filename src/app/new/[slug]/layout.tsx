import type { Metadata } from "next";
import { v2AdminClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import PwaRegistrar from "./PwaRegistrar";
import MusicProvider from "./(event)/MusicProvider";
import { NameModeProvider } from "./(event)/NameMode";
import SimBanner from "./(event)/SimBanner";
import { SimTimeProvider } from "./(event)/SimTime";
import { getSimAt, v2Now } from "@/lib/v2/simulator";

/**
 * Org subtree wrapper. Purely additive: it points the PWA manifest + Apple title
 * at THIS org (overriding the root /manifest.json for /new/<slug> only) and
 * registers the service worker, so each tenant installs as its own app. Renders
 * children unchanged — the (event) shell and admin layouts nest inside it.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const admin = v2AdminClient();
  const { data: org } = await admin
    .from("v2_organizations")
    .select("name, logo_url")
    .eq("slug", slug)
    .maybeSingle();
  const name = org?.name || "Golfapalooza";
  const base = `/new/${slug}`;
  // Cache-bust the favicon/app icon by the logo's unique filename, so changing
  // the logo swaps the browser tab + home-screen icon immediately (browsers cache
  // favicons hard; a stable URL would stay stale).
  const ver = org?.logo_url ? encodeURIComponent(org.logo_url.split("/").pop() || "1") : null;
  const meta: Metadata = {
    title: name,
    applicationName: name,
    manifest: `${base}/manifest.webmanifest`,
    appleWebApp: { capable: true, statusBarStyle: "default", title: name },
  };
  // Point the favicon + Apple touch icon at the org's logo (composited by the
  // icon route). Falls back to the app default when the org has no logo.
  if (ver) {
    meta.icons = {
      icon: [{ url: `${base}/icon?size=192&v=${ver}`, sizes: "192x192", type: "image/png" }],
      shortcut: [{ url: `${base}/icon?size=192&v=${ver}` }],
      apple: [{ url: `${base}/icon?size=512&v=${ver}`, sizes: "512x512", type: "image/png" }],
    };
  }
  return meta;
}

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Mount the music provider + name-mode at the ORG level (not the event group)
  // so a single audio session survives navigation to any /new/<slug>/* page —
  // the full-screen scorer, admin, etc. — instead of stopping when the (event)
  // layout unmounts. The mini-player renders here too, above the bottom nav.
  // Non-members get plain children; the inner layouts handle the redirect.
  const ctx = await getPlatformContext();
  const org = ctx?.orgs.find((o) => o.slug === slug);
  const simAt = await getSimAt();
  const serverNowMs = (await v2Now()).getTime();

  if (!org) {
    return (
      <>
        <PwaRegistrar />
        {children}
      </>
    );
  }

  // Apply THIS org's brand color across the whole /new/<slug> subtree. The root
  // /new layout only resolves a color for custom domains; path-based routes land
  // here, so we override --brand from the org's saved primary_color. A
  // display:contents wrapper carries the CSS var down the cascade with no layout
  // impact; a null color keeps the inherited default green.
  const brandStyle = org.primary_color
    ? ({ display: "contents", ["--brand" as string]: org.primary_color } as React.CSSProperties)
    : ({ display: "contents" } as React.CSSProperties);

  return (
    <div style={brandStyle}>
      <PwaRegistrar />
      {(ctx?.simulating || simAt) && <SimBanner name={ctx?.simulating ? ctx.simName : null} at={simAt} />}
      <SimTimeProvider serverNowMs={serverNowMs}>
        <NameModeProvider mode={org.name_display}>
          <MusicProvider orgId={org.id}>{children}</MusicProvider>
        </NameModeProvider>
      </SimTimeProvider>
    </div>
  );
}
