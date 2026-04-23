import { createAdminClient } from "@/lib/supabase/admin";
import { LoozersList } from "@/components/LoozersList";

export default async function SpectatorLoozersPage() {
  const adminClient = createAdminClient();

  const [{ data: users }, { data: bios }] = await Promise.all([
    adminClient
      .from("users")
      .select("id, display_name, avatar_url")
      .eq("is_financial_only", false)
      .order("display_name"),
    adminClient
      .from("loozer_bios")
      .select("user_id, content")
      .eq("is_visible", true),
  ]);

  const bioUserIds = new Set(
    (bios || []).filter((b) => b.content && b.content.trim().length > 0).map((b) => b.user_id)
  );

  const loozers = (users || []).map((u) => ({
    id: u.id,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    has_bio: bioUserIds.has(u.id),
  }));

  return (
    <div className="px-4 pt-6 pb-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Meet the Loozers</h1>
      <LoozersList loozers={loozers} basePath="/spectator/loozers" />
    </div>
  );
}
