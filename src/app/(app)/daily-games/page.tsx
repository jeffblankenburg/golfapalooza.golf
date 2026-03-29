import { getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";


export default async function DailyGamesPage() {
  const user = await getAuthUser();

  if (!user) redirect("/login");

  const adminClient = createAdminClient();
  const { data: trip } = await adminClient
    .from("trip_settings")
    .select("id, start_date")
    .eq("status", "active")
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Daily Games</h1>
        <p className="text-gray-500 text-center py-8">No active event.</p>
      </div>
    );
  }

  const { data: winners } = await adminClient
    .from("daily_contest_winners")
    .select("id, day_number, contest_type, user_id, user:users!daily_contest_winners_user_id_fkey(display_name, avatar_url)")
    .eq("trip_id", trip.id)
    .order("day_number")
    .order("contest_type");

  const startDate = new Date(trip.start_date + "T00:00:00");
  const dayLabels = (dayNum: number) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + dayNum - 1);
    return date.toLocaleDateString("en-US", { weekday: "long" });
  };

  const contestLabels: Record<string, string> = {
    ctp: "Closest to Pin",
    long_putt: "Long Putt",
  };

  const days = [2, 3, 4];

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Daily Games</h1>

      {days.map((dayNum) => {
        const dayWinners = (winners || []).filter((w) => w.day_number === dayNum);
        return (
          <div key={dayNum} className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Day {dayNum} &middot; {dayLabels(dayNum)}
            </h2>
            {["ctp", "long_putt"].map((contestType) => {
              const winner = dayWinners.find((w) => w.contest_type === contestType);
              const u = winner?.user
                ? Array.isArray(winner.user) ? winner.user[0] : winner.user
                : null;

              return (
                <div key={contestType} className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-3 py-2.5">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                    contestType === "ctp" ? "bg-teal-50 text-teal-600" : "bg-amber-50 text-amber-600"
                  }`}>
                    {contestType === "ctp" ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{contestLabels[contestType]}</p>
                    {u ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[9px] font-bold">
                            {(u.display_name || "?")[0].toUpperCase()}
                          </span>
                        )}
                        <span className="text-sm text-gray-700 font-medium">{u.display_name}</span>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 mt-0.5">TBD</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

    </div>
  );
}
