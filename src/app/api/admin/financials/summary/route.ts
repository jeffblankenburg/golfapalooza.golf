import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

// GET - Financial summary dashboard for a trip
export async function GET(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");

  if (!tripId) {
    return NextResponse.json({ error: "trip_id is required" }, { status: 400 });
  }

  try {
    const adminClient = createAdminClient();

    // 1. Get all event_participants for this trip (the roster)
    const { data: participants, error: partError } = await adminClient
      .from("event_participants")
      .select("user_id, user:users!event_participants_user_id_fkey(id, display_name, full_name, avatar_url)")
      .eq("trip_id", tripId);

    if (partError) {
      return NextResponse.json({ error: partError.message }, { status: 500 });
    }

    if (!participants || participants.length === 0) {
      return NextResponse.json({
        trip_totals: { total_charges: 0, total_payments: 0, total_outstanding: 0 },
        loozers: [],
      });
    }

    // Deduplicate by user_id (a user could appear multiple times)
    const userMap = new Map<string, { id: string; display_name: string; full_name: string; avatar_url: string | null }>();
    for (const p of participants) {
      const u = p.user as unknown as { id: string; display_name: string; full_name: string; avatar_url: string | null } | null;
      if (u && !userMap.has(p.user_id)) {
        userMap.set(p.user_id, u);
      }
    }

    const userIds = Array.from(userMap.keys());

    // 2. Get ALL financial_transactions for these users (for lifetime calcs)
    const { data: transactions, error: txnError } = await adminClient
      .from("financial_transactions")
      .select("user_id, trip_id, type, amount")
      .in("user_id", userIds);

    if (txnError) {
      return NextResponse.json({ error: txnError.message }, { status: 500 });
    }

    // 3. Calculate per-user summaries
    const loozers = userIds.map((userId) => {
      const user = userMap.get(userId)!;
      const userTxns = (transactions || []).filter((t) => t.user_id === userId);

      const tripCharges = userTxns
        .filter((t) => t.type === "charge" && t.trip_id === tripId)
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const tripPayments = userTxns
        .filter((t) => t.type === "payment" && t.trip_id === tripId)
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const lifetimeCharges = userTxns
        .filter((t) => t.type === "charge")
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const lifetimePayments = userTxns
        .filter((t) => t.type === "payment")
        .reduce((sum, t) => sum + Number(t.amount), 0);

      return {
        user_id: userId,
        display_name: user.display_name,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        trip_charges: Number(tripCharges.toFixed(2)),
        trip_payments: Number(tripPayments.toFixed(2)),
        trip_balance: Number((tripPayments - tripCharges).toFixed(2)),
        lifetime_charges: Number(lifetimeCharges.toFixed(2)),
        lifetime_payments: Number(lifetimePayments.toFixed(2)),
        lifetime_balance: Number((lifetimePayments - lifetimeCharges).toFixed(2)),
      };
    });

    // 4. Calculate trip totals
    const tripTotals = loozers.reduce(
      (acc, l) => ({
        total_charges: acc.total_charges + l.trip_charges,
        total_payments: acc.total_payments + l.trip_payments,
        total_outstanding: acc.total_outstanding + Math.abs(Math.min(l.trip_balance, 0)),
      }),
      { total_charges: 0, total_payments: 0, total_outstanding: 0 }
    );

    return NextResponse.json({
      trip_totals: {
        total_charges: Number(tripTotals.total_charges.toFixed(2)),
        total_payments: Number(tripTotals.total_payments.toFixed(2)),
        total_outstanding: Number(tripTotals.total_outstanding.toFixed(2)),
      },
      loozers,
    });
  } catch (error) {
    console.error("Financial summary error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
