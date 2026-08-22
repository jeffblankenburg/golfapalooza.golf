import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSimulating, getEffectiveTripId } from "@/lib/simulator";
import { AdminLink } from "@/components/AdminLink";
import { ShirtCard } from "@/components/shirt-guide/ShirtCard";

interface Shirt {
  id: string;
  day_label: string;
  name: string;
  description: string | null;
  image_url: string | null;
}

export default async function ShirtGuidePage() {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const simulating = await isSimulating();
  const queryClient = simulating ? createAdminClient() : supabase;

  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id")
    .eq("id", (await getEffectiveTripId())!)
    .single();

  const { data: shirts } = trip
    ? await queryClient
        .from("event_shirts")
        .select("id, day_label, name, description, image_url")
        .eq("trip_id", trip.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
    : { data: [] as Shirt[] };

  // Group shirts by day label — every shirt sharing a day lands under one
  // heading even when their sort_orders interleave with other days. Days are
  // ordered by their first-seen shirt (the query is already sorted by
  // sort_order), and shirts keep that order within each day.
  const dayMap = new Map<string, Shirt[]>();
  for (const shirt of (shirts as Shirt[]) || []) {
    const list = dayMap.get(shirt.day_label);
    if (list) list.push(shirt);
    else dayMap.set(shirt.day_label, [shirt]);
  }
  const days = [...dayMap.entries()].map(([label, shirts]) => ({ label, shirts }));

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Shirt Guide</h1>
        <AdminLink permissionKey="manage_event_settings" href="/admin/shirts" />
      </div>
      <p className="text-sm text-gray-500 mb-5">What to wear each day of the event.</p>

      {days.length === 0 ? (
        <p className="text-gray-400 text-center py-12">
          The shirt guide hasn&rsquo;t been posted yet. Check back soon.
        </p>
      ) : (
        <div className="space-y-6">
          {days.map((day) => (
            <div key={day.label}>
              <h2 className="text-sm font-semibold text-green-700 uppercase tracking-wide mb-2">
                {day.label}
              </h2>
              <div className="space-y-3">
                {day.shirts.map((shirt) => (
                  <ShirtCard
                    key={shirt.id}
                    name={shirt.name}
                    description={shirt.description}
                    imageUrl={shirt.image_url}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
