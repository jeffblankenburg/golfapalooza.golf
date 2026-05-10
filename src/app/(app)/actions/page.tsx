import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { ActionItemsList } from "@/components/ActionItemsList";
import { getEffectiveUserId, isSimulating, getEffectiveTripId } from "@/lib/simulator";

export default async function ActionsPage() {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const simulating = await isSimulating();
  const effectiveUserId = await getEffectiveUserId(user.id);
  const queryClient = simulating ? createAdminClient() : supabase;

  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id")
    .eq("id", (await getEffectiveTripId())!)
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Action Items</h1>
        <p className="text-gray-500 text-center py-8">No active event.</p>
      </div>
    );
  }

  const [itemsResult, completionsResult] = await Promise.all([
    queryClient
      .from("action_items")
      .select("*")
      .eq("trip_id", trip.id)
      .order("sort_order"),
    queryClient
      .from("user_action_completions")
      .select("action_item_id, completed_at")
      .eq("user_id", effectiveUserId),
  ]);

  return (
    <ActionItemsList
      items={itemsResult.data || []}
      completions={completionsResult.data || []}
    />
  );
}
