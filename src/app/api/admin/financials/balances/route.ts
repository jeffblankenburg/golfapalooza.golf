import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

// GET - Balances data: all users with lifetime financial summaries
export async function GET() {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const adminClient = createAdminClient();

    // Fetch all data in parallel
    const [
      contestsResult,
      tripsResult,
      txnResult,
      usersResult,
      contestParticipantsResult,
      eventParticipantsResult,
      activeTripResult,
    ] = await Promise.all([
      adminClient
        .from("financial_contests")
        .select("id, name, contest_date, entry_fee")
        .order("contest_date", { ascending: false, nullsFirst: false }),
      adminClient
        .from("trip_settings")
        .select("id, trip_name, trip_year, start_date")
        .order("trip_year", { ascending: false }),
      adminClient
        .from("financial_transactions")
        .select("user_id, financial_contest_id, trip_id, type, amount"),
      adminClient
        .from("users")
        .select("id, display_name, full_name, avatar_url")
        .eq("is_system", false)
        .order("display_name"),
      adminClient
        .from("financial_contest_participants")
        .select("financial_contest_id, user_id"),
      adminClient
        .from("event_participants")
        .select("trip_id, user_id, likelihood"),
      adminClient
        .from("trip_settings")
        .select("id, trip_name, trip_year")
        .eq("status", "active")
        .maybeSingle(),
    ]);

    if (contestsResult.error) {
      return NextResponse.json({ error: contestsResult.error.message }, { status: 500 });
    }
    if (tripsResult.error) {
      return NextResponse.json({ error: tripsResult.error.message }, { status: 500 });
    }
    if (txnResult.error) {
      return NextResponse.json({ error: txnResult.error.message }, { status: 500 });
    }
    if (usersResult.error) {
      return NextResponse.json({ error: usersResult.error.message }, { status: 500 });
    }

    const contests = contestsResult.data || [];
    const trips = tripsResult.data || [];
    const transactions = txnResult.data || [];
    const allUsers = usersResult.data || [];

    // Build participation sets
    const contestParticipants: Record<string, string[]> = {};
    for (const cp of contestParticipantsResult.data || []) {
      if (!contestParticipants[cp.financial_contest_id]) {
        contestParticipants[cp.financial_contest_id] = [];
      }
      contestParticipants[cp.financial_contest_id].push(cp.user_id);
    }

    const eventParticipants: Record<string, string[]> = {};
    const activeTrip = activeTripResult.data || null;
    const activeAttending: string[] = [];
    for (const ep of eventParticipantsResult.data || []) {
      if (!eventParticipants[ep.trip_id]) {
        eventParticipants[ep.trip_id] = [];
      }
      eventParticipants[ep.trip_id].push(ep.user_id);
      if (activeTrip && ep.trip_id === activeTrip.id && ep.likelihood === 99) {
        activeAttending.push(ep.user_id);
      }
    }

    // Aggregate per-user totals, per-contest balances, and per-trip balances
    const userAgg = new Map<string, { charges: number; payments: number }>();
    const contestBalances: Record<string, Record<string, number>> = {};
    const tripBalances: Record<string, Record<string, number>> = {};
    const uncategorized: Record<string, number> = {};

    for (const t of transactions) {
      // Per-user lifetime totals
      const agg = userAgg.get(t.user_id) || { charges: 0, payments: 0 };
      const amt = Number(t.amount);
      if (t.type === "charge") agg.charges += amt;
      else agg.payments += amt;
      userAgg.set(t.user_id, agg);

      const delta = t.type === "payment" ? amt : -amt;

      // Per-user per-contest net balance
      if (t.financial_contest_id) {
        if (!contestBalances[t.user_id]) contestBalances[t.user_id] = {};
        contestBalances[t.user_id][t.financial_contest_id] =
          (contestBalances[t.user_id][t.financial_contest_id] || 0) + delta;
      }

      // Per-user per-trip net balance
      if (t.trip_id) {
        if (!tripBalances[t.user_id]) tripBalances[t.user_id] = {};
        tripBalances[t.user_id][t.trip_id] =
          (tripBalances[t.user_id][t.trip_id] || 0) + delta;
      }

      // Per-user uncategorized balance (no trip, no contest)
      if (!t.trip_id && !t.financial_contest_id) {
        if (!uncategorized[t.user_id]) uncategorized[t.user_id] = 0;
        uncategorized[t.user_id] += delta;
      }
    }

    // Round balances
    for (const userId of Object.keys(contestBalances)) {
      for (const key of Object.keys(contestBalances[userId])) {
        contestBalances[userId][key] = Number(contestBalances[userId][key].toFixed(2));
      }
    }
    for (const userId of Object.keys(tripBalances)) {
      for (const key of Object.keys(tripBalances[userId])) {
        tripBalances[userId][key] = Number(tripBalances[userId][key].toFixed(2));
      }
    }
    for (const userId of Object.keys(uncategorized)) {
      uncategorized[userId] = Number(uncategorized[userId].toFixed(2));
    }

    // Build user list — all users, with their financial summaries
    const users = allUsers.map((u) => {
      const agg = userAgg.get(u.id) || { charges: 0, payments: 0 };
      return {
        user_id: u.id,
        display_name: u.display_name,
        full_name: u.full_name,
        avatar_url: u.avatar_url,
        total_charges: Number(agg.charges.toFixed(2)),
        total_payments: Number(agg.payments.toFixed(2)),
        balance: Number((agg.payments - agg.charges).toFixed(2)),
      };
    });

    return NextResponse.json({
      contests,
      trips,
      users,
      contest_balances: contestBalances,
      trip_balances: tripBalances,
      contest_participants: contestParticipants,
      event_participants: eventParticipants,
      uncategorized,
      active_trip: activeTrip,
      active_trip_attending: activeAttending,
    });
  } catch (error) {
    console.error("Balances error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
