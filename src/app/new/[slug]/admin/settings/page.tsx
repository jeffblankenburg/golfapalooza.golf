import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import GroupSettingsForm from "./GroupSettingsForm";

export default async function GroupSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");

  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");
  // Members can't edit — only owners/admins reach settings.
  if (org.role !== "owner" && org.role !== "admin") redirect(`/new/${slug}`);

  return (
    <GroupSettingsForm
      orgId={org.id}
      slug={org.slug}
      initialName={org.name}
      initialColor={org.primary_color || "#0a5c36"}
      initialLogo={org.logo_url}
      initialStoreUrl={org.store_url}
      initialStoreLabel={org.store_label}
      initialStoreEnabled={org.store_enabled}
      initialNameDisplay={org.name_display}
      initialSystemName={org.system_name || "System"}
      initialSystemAvatar={org.system_avatar_url}
    />
  );
}
