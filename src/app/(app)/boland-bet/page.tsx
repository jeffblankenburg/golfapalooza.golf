import { getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveTripId } from "@/lib/simulator";
import { getBolandBet } from "@/lib/boland-bet/compute";

export { zoomableViewport as viewport } from "@/lib/viewport";

export default async function BolandBetPage() {
  await getAuthUser();
  const admin = createAdminClient();

  const { data: trip } = await admin
    .from("trip_settings")
    .select("id, course_id")
    .eq("id", (await getEffectiveTripId())!)
    .single();

  const bet = trip ? await getBolandBet(admin, trip) : null;

  return (
    <div className="px-4 pt-6 pb-8">
      <h1 className="text-2xl font-bold text-gray-900">Boland Bet</h1>
      <p className="text-sm text-gray-500 mt-1">
        Every player in the bet is on the line for their Hole&nbsp;#1 score in the KGB Cup
        {bet?.par != null ? ` (par ${bet.par})` : ""}. Par or better wins&nbsp;$20; bogey or worse
        and Boland keeps the&nbsp;$10 bet.
      </p>

      {!bet ? (
        <p className="text-gray-500 text-center py-12">
          Nobody has opted into the Boland Bet yet.
        </p>
      ) : (
        <div className="mt-5 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Column header */}
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 text-[0.7rem] font-semibold uppercase tracking-wide text-gray-400">
            <span className="flex-1">Player</span>
            <span className="w-10 text-center">#1</span>
            <span className="w-16 text-right">Balance</span>
          </div>

          {/* Lines */}
          <div className="divide-y divide-gray-100">
            {bet.lines.map((line) => (
              <div key={line.userId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-800">
                  {line.displayName}
                </span>
                <span
                  className={`w-10 inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-sm font-semibold ${
                    line.result === "win"
                      ? "bg-green-100 text-green-700"
                      : line.result === "loss"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {line.score != null ? line.score : "–"}
                </span>
                <span
                  className={`w-16 text-right text-sm font-semibold tabular-nums ${
                    line.result === "win"
                      ? "text-green-700"
                      : line.result === "loss"
                        ? "text-red-600"
                        : "text-gray-400"
                  }`}
                >
                  {line.result === "win"
                    ? "+$20"
                    : line.result === "loss"
                      ? "−$10"
                      : "—"}
                </span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-t border-gray-200">
            <span className="flex-1 text-sm font-bold text-gray-900">Total</span>
            <span className="w-10" />
            <span
              className={`w-16 text-right text-base font-bold tabular-nums ${
                bet.total > 0
                  ? "text-green-700"
                  : bet.total < 0
                    ? "text-red-600"
                    : "text-gray-500"
              }`}
            >
              {bet.total > 0 ? "+" : bet.total < 0 ? "−" : ""}${Math.abs(bet.total)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
