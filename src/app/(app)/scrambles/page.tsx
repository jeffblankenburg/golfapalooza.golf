import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ScorecardsContent } from "@/components/ScorecardsContent";
import { loadPayoutSheet } from "@/lib/payout-events/compute";
import { computePayoutSplits } from "@/lib/payout-events/splits";

export { zoomableViewport as viewport } from "@/lib/viewport";

const DAY_NAMES = ["thursday", "friday", "saturday"];

function dayFromLabel(label: string): number | null {
  const lbl = label.toLowerCase();
  for (let i = 0; i < DAY_NAMES.length; i++) {
    if (lbl.includes(DAY_NAMES[i])) return i + 2; // Thu=2, Fri=3, Sat=4
  }
  return null;
}

export default async function ScorecardsPage() {
  const user = await getAuthUser();

  if (!user) return null;

  const supabase = await createClient();

  // Get active trip
  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id, start_date")
    .eq("status", "active")
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6 text-center text-gray-500">
        No active event found.
      </div>
    );
  }

  // Get scramble contests (dynamic days from event_days)
  const { data: contests } = await supabase
    .from("contests")
    .select("id, name, day_number, scoring_closed_at, verified_at")
    .eq("trip_id", trip.id)
    .eq("contest_type", "scramble")
    .order("day_number");

  // Per-day scramble Team payout pulled from the new cost_items-driven
  // payout sheet. Pot total = row.total. Per-place amounts come from the
  // row's admin-configured payout_splits column (default for scramble_team:
  // [{place:1, kind:"remainder"}, {place:2, kind:"flat", amount:80}]).
  // Skins, CTP, LD, LP are intentionally excluded — the page is about the
  // scramble team competition specifically.
  const adminClient = createAdminClient();
  const allPayoutRows = await loadPayoutSheet(adminClient, trip.id);
  const dayScramblePayouts: Record<number, { pot: number; first: number; second: number }> = {};
  for (const row of allPayoutRows) {
    if (row.winner_source !== "scramble_team") continue;
    const day = dayFromLabel(row.label);
    if (day == null) continue;
    const splits = computePayoutSplits(row.total, row.payout_splits);
    dayScramblePayouts[day] = {
      pot: row.total,
      first: splits.get(1) ?? 0,
      second: splits.get(2) ?? 0,
    };
  }

  return (
    <ScorecardsContent
      contests={contests || []}
      startDate={trip.start_date}
      dayScramblePayouts={dayScramblePayouts}
    />
  );
}
