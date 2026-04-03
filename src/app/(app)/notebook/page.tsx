import { createClient, getAuthUser } from "@/lib/supabase/server";
import { NotebookContent } from "@/components/notebook/NotebookContent";

export default async function NotebookPage() {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id")
    .eq("status", "active")
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6 text-center text-gray-500">
        No active event found.
      </div>
    );
  }

  const [categoriesResult, notesResult] = await Promise.all([
    supabase
      .from("notebook_categories")
      .select("id, name, sort_order")
      .eq("trip_id", trip.id)
      .order("sort_order"),
    supabase
      .from("notebook_notes")
      .select("id, title, content, category_id, sort_order, pinned_to")
      .eq("trip_id", trip.id)
      .order("sort_order"),
  ]);

  const categories = (categoriesResult.data || []).map((cat) => ({
    ...cat,
    notes: (notesResult.data || []).filter((n) => n.category_id === cat.id),
  }));

  return <NotebookContent categories={categories} />;
}
