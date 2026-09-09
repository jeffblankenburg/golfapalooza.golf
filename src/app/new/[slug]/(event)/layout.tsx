import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import EventShell from "./EventShell";

/**
 * Wraps the member-facing event experience in the fixed top-bar/bottom-nav shell.
 * Scoped to the (event) route group so /new/[slug]/admin/* does NOT get the shell.
 */
export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");
  const isAdmin = org.role === "owner" || org.role === "admin";

  return (
    <EventShell
      slug={slug}
      isAdmin={isAdmin}
      orgName={org.name}
      logoUrl={org.logo_url}
    >
      {children}
    </EventShell>
  );
}
