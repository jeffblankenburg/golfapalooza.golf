import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

export default async function SpectatorLoozersPage() {
  const adminClient = createAdminClient();

  const { data: activeTrip } = await adminClient
    .from("trip_settings")
    .select("id")
    .eq("status", "active")
    .maybeSingle();

  if (!activeTrip) {
    return (
      <div className="px-4 pt-6 text-center text-gray-500">
        No active event found.
      </div>
    );
  }

  const { data: participants } = await adminClient
    .from("event_participants")
    .select("user_id")
    .eq("trip_id", activeTrip.id)
    .eq("on_roster", true);

  if (!participants || participants.length === 0) {
    return (
      <div className="px-4 pt-6 pb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Meet the Loozers</h1>
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg font-medium">No Loozers found</p>
          <p className="text-sm mt-1">Check back once the roster is set.</p>
        </div>
      </div>
    );
  }

  const userIds = participants.map((p) => p.user_id);

  const { data: users } = await adminClient
    .from("users")
    .select("id, display_name, avatar_url")
    .in("id", userIds)
    .order("display_name");

  return (
    <div className="px-4 pt-6 pb-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Meet the Loozers</h1>
      <div className="grid grid-cols-3 gap-3">
        {(users || []).map((loozer) => (
          <Link
            key={loozer.id}
            href={`/spectator/loozers/${loozer.id}`}
            className="flex flex-col items-center p-3 bg-white rounded-xl border border-gray-200 shadow-sm active:scale-95 transition-transform"
          >
            <div className="w-16 h-16 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center mb-2">
              {loozer.avatar_url ? (
                <img
                  src={loozer.avatar_url}
                  alt={loozer.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xl font-bold">
                  {getInitials(loozer.display_name)}
                </span>
              )}
            </div>
            <span className="text-xs font-semibold text-gray-900 text-center leading-tight">
              {loozer.display_name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
