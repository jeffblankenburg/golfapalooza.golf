import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSimulating, getEffectiveTripId } from "@/lib/simulator";
import { AdminLink } from "@/components/AdminLink";

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

  // Group consecutive shirts by day, preserving the admin-defined order.
  const days: { label: string; shirts: Shirt[] }[] = [];
  for (const shirt of (shirts as Shirt[]) || []) {
    const last = days[days.length - 1];
    if (last && last.label === shirt.day_label) {
      last.shirts.push(shirt);
    } else {
      days.push({ label: shirt.day_label, shirts: [shirt] });
    }
  }

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
                  <div
                    key={shirt.id}
                    className="flex gap-4 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
                  >
                    <div className="w-24 h-24 flex-shrink-0 bg-gray-100 flex items-center justify-center">
                      {shirt.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={shirt.image_url}
                          alt={shirt.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <svg className="w-9 h-9 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.47a2 2 0 00-1.34-2.23z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 py-3 pr-3 self-center">
                      <p className="font-semibold text-gray-900">{shirt.name}</p>
                      {shirt.description && (
                        <p className="text-sm text-gray-500 mt-0.5">{shirt.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
