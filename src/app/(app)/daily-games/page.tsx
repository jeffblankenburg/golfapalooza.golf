import { getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";
import { getEffectiveDate } from "@/lib/simulator";
import { isFeatureVisible } from "@/lib/visibility";


export default async function DailyGamesPage() {
  const user = await getAuthUser();

  if (!user) redirect("/login");

  const adminClient = createAdminClient();
  const { data: trip } = await adminClient
    .from("trip_settings")
    .select("id, start_date, visibility_overrides")
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

  const now = await getEffectiveDate();
  if (!isFeatureVisible("daily_games", { start_date: trip.start_date, visibility_overrides: (trip.visibility_overrides as Record<string, boolean>) || {} }, now)) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Daily Games</h1>
        <p className="text-gray-500 text-center py-8">Daily game results will be available once the event begins.</p>
      </div>
    );
  }

  const [winnersResult, eventDaysResult] = await Promise.all([
    adminClient
      .from("daily_contest_winners")
      .select("id, day_number, contest_type, user_id, user:users!daily_contest_winners_user_id_fkey(display_name, avatar_url)")
      .eq("trip_id", trip.id)
      .order("day_number")
      .order("contest_type"),
    adminClient
      .from("contests")
      .select("day_number")
      .eq("trip_id", trip.id)
      .eq("contest_type", "scramble")
      .not("day_number", "is", null)
      .order("day_number"),
  ]);

  const winners = winnersResult.data;

  const startDate = new Date(trip.start_date + "T00:00:00");
  const dayLabels = (dayNum: number) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + dayNum - 1);
    return date.toLocaleDateString("en-US", { weekday: "long" });
  };

  const contestLabels: Record<string, string> = {
    ctp_front: "Closest to Pin — Front 9",
    ctp_back: "Closest to Pin — Back 9",
    long_drive: "Long Drive",
    long_putt: "Long Putt",
  };

  const days = [...new Set(
    (eventDaysResult.data || []).map((d) => d.day_number as number)
  )];

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Daily Games</h1>
        <PinnedNoteButton pinnedTo="daily_games" />
      </div>

      {days.map((dayNum) => {
        const dayWinners = (winners || []).filter((w) => w.day_number === dayNum);
        return (
          <div key={dayNum} className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Day {dayNum} &middot; {dayLabels(dayNum)}
            </h2>
            {["ctp_front", "ctp_back", "long_drive", "long_putt"].map((contestType) => {
              const winner = dayWinners.find((w) => w.contest_type === contestType);
              const u = winner?.user
                ? Array.isArray(winner.user) ? winner.user[0] : winner.user
                : null;

              const isCtp = contestType.startsWith("ctp");
              const iconColor = isCtp
                ? "bg-teal-50 text-teal-600"
                : contestType === "long_drive"
                ? "bg-sky-50 text-sky-600"
                : "bg-amber-50 text-amber-600";

              return (
                <div key={contestType} className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-3 py-2.5">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full ${iconColor}`}>
                    {isCtp ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    ) : contestType === "long_drive" ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
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
                    ) : null}
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
