import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ActionItemsList } from "@/components/ActionItemsList";

export default async function ActionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id")
    .eq("status", "active")
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
    supabase
      .from("action_items")
      .select("*")
      .eq("trip_id", trip.id)
      .order("sort_order"),
    supabase
      .from("user_action_completions")
      .select("action_item_id, completed_at")
      .eq("user_id", user.id),
  ]);

  return (
    <ActionItemsList
      items={itemsResult.data || []}
      completions={completionsResult.data || []}
    />
  );
}
