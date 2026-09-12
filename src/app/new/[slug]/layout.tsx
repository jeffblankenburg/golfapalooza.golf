import type { Metadata } from "next";
import { v2AdminClient } from "@/lib/v2/supabase";
import PwaRegistrar from "./PwaRegistrar";

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
    .select("name")
    .eq("slug", slug)
    .maybeSingle();
  const name = org?.name || "Golfapalooza";
  return {
    title: name,
    applicationName: name,
    manifest: `/new/${slug}/manifest.webmanifest`,
    appleWebApp: { capable: true, statusBarStyle: "default", title: name },
  };
}

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PwaRegistrar />
      {children}
    </>
  );
}
