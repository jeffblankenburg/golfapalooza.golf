import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/financials/contests/impact:
 *   get:
 *     summary: Preview the impact of deleting a financial contest
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Counts and totals of records affected by deletion
 */
export async function GET(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const adminClient = createAdminClient();

    const [participantsRes, txRes] = await Promise.all([
      adminClient
        .from("financial_contest_participants")
        .select("id", { count: "exact", head: true })
        .eq("financial_contest_id", id),
      adminClient
        .from("financial_transactions")
        .select("type, source, amount")
        .eq("financial_contest_id", id),
    ]);

    if (participantsRes.error) {
      return NextResponse.json({ error: participantsRes.error.message }, { status: 500 });
    }
    if (txRes.error) {
      return NextResponse.json({ error: txRes.error.message }, { status: 500 });
    }

    const txs = txRes.data || [];
    const entry = { count: 0, total: 0 };
    const bySource: Record<string, { count: number; total: number }> = {};
    const other = { count: 0, total: 0 };

    for (const t of txs) {
      const amt = Number(t.amount || 0);
      if (t.source === "contest_entry") {
        entry.count += 1;
        entry.total += amt;
        continue;
      }
      const key = t.source || "manual";
      // Only track the sources that can legitimately attribute to a contest
      if (["winnings", "credit", "expense", "manual", "adjustment"].includes(key)) {
        const bucket = bySource[key] ||= { count: 0, total: 0 };
        bucket.count += 1;
        bucket.total += amt;
      } else {
        other.count += 1;
        other.total += amt;
      }
    }

    return NextResponse.json({
      participant_count: participantsRes.count || 0,
      entry_charges: entry,
      orphan_by_source: bySource,
      orphan_other: other,
    });
  } catch (error) {
    console.error("Financial contest impact error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
