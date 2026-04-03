import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * @swagger
 * /api/financials/me:
 *   get:
 *     summary: Get current user's financial data
 *     tags: [Financials]
 *     responses:
 *       200:
 *         description: User's balance and transaction history
 *       401:
 *         description: Unauthorized
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const adminClient = createAdminClient();

    const { data: transactions, error } = await adminClient
      .from("financial_transactions")
      .select(
        "id, trip_id, type, source, description, amount, method, notes, created_at, trip:trip_settings!financial_transactions_trip_id_fkey(trip_name, trip_year)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formatted = (transactions || []).map((t) => {
      const trip = t.trip as unknown as {
        trip_name: string;
        trip_year: number;
      } | null;
      return {
        id: t.id,
        trip_id: t.trip_id,
        trip_name: trip?.trip_name ?? null,
        trip_year: trip?.trip_year ?? null,
        type: t.type,
        source: t.source,
        description: t.description,
        amount: Number(t.amount),
        method: t.method,
        notes: t.notes,
        created_at: t.created_at,
      };
    });

    let totalCharges = 0;
    let totalPayments = 0;
    for (const t of formatted) {
      if (t.type === "charge") {
        totalCharges += t.amount;
      } else if (t.type === "payment") {
        totalPayments += t.amount;
      }
    }

    return NextResponse.json({
      balance: {
        total_charges: Math.round(totalCharges * 100) / 100,
        total_payments: Math.round(totalPayments * 100) / 100,
        balance: Math.round((totalPayments - totalCharges) * 100) / 100,
      },
      transactions: formatted,
    });
  } catch (error) {
    console.error("Financials me error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
