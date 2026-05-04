import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { NotebookContent } from "@/components/notebook/NotebookContent";

export default async function SpectatorNotebookPage() {
  const adminClient = createAdminClient();

  const { data: trip } = await adminClient
    .from("trip_settings")
    .select("id")
    .eq("status", "active")
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6 pb-8 space-y-4">
        <Link href="/spectator" className="text-sm text-green-700 font-medium inline-block">
          &larr; Home
        </Link>
        <p className="text-center text-gray-500">No active event found.</p>
      </div>
    );
  }

  const [categoriesResult, notesResult] = await Promise.all([
    adminClient
      .from("notebook_categories")
      .select("id, name, sort_order")
      .eq("trip_id", trip.id)
      .eq("is_system", false)
      .order("sort_order"),
    adminClient
      .from("notebook_notes")
      .select("id, title, content, category_id, sort_order, pinned_to")
      .eq("trip_id", trip.id)
      .order("sort_order"),
  ]);

  const categories = (categoriesResult.data || []).map((cat) => ({
    ...cat,
    notes: (notesResult.data || []).filter((n) => n.category_id === cat.id),
  }));

  return (
    <div className="space-y-2">
      <div className="px-4 pt-6">
        <Link href="/spectator" className="text-sm text-green-700 font-medium inline-block">
          &larr; Home
        </Link>
      </div>
      <NotebookContent categories={categories} />
    </div>
  );
}
