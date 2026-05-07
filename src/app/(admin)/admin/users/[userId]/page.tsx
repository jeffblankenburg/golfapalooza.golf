import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserDetail } from "@/components/admin/UserDetail";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const adminClient = createAdminClient();

  const { data: userRow } = await adminClient
    .from("users")
    .select("*, player_handicaps(handicap_index)")
    .eq("id", userId)
    .single();

  if (!userRow) {
    notFound();
  }

  const ph = Array.isArray(userRow.player_handicaps)
    ? userRow.player_handicaps[0]
    : userRow.player_handicaps;
  const { player_handicaps: _drop, ...rest } = userRow;
  void _drop;
  const initialUser = { ...rest, handicap_index: ph?.handicap_index ?? null };

  // All users (for sponsor picker + descendant checks)
  const { data: allUsers } = await adminClient
    .from("users")
    .select("id, display_name, full_name, avatar_url, sponsor_id, is_financial_only, is_system")
    .order("display_name", { ascending: true });

  return <UserDetail initialUser={initialUser} allUsers={allUsers || []} />;
}
