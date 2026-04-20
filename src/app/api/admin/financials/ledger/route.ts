import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

// GET - Full transaction history for a single user
export async function GET(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");

  if (!userId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  try {
    const adminClient = createAdminClient();

    const [txnResult, historyResult] = await Promise.all([
      adminClient
        .from("financial_transactions")
        .select(
          "id, trip_id, financial_contest_id, type, source, description, amount, method, notes, created_by, created_at, trip:trip_settings!financial_transactions_trip_id_fkey(trip_name), contest:financial_contests!financial_transactions_financial_contest_id_fkey(name), creator:users!financial_transactions_created_by_fkey(display_name)"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      adminClient
        .from("financial_transaction_history")
        .select("transaction_id, changed_by, changed_at, changer:users!financial_transaction_history_changed_by_fkey(display_name)")
        .order("changed_at", { ascending: false }),
    ]);

    if (txnResult.error) {
      return NextResponse.json({ error: txnResult.error.message }, { status: 500 });
    }

    // Build map: transaction_id -> most recent editor (first entry per txn since sorted desc)
    const lastEditorMap = new Map<string, { name: string; has_history: boolean }>();
    for (const h of historyResult.data || []) {
      if (!lastEditorMap.has(h.transaction_id)) {
        const changerName = (h.changer as unknown as { display_name: string } | null)?.display_name ?? null;
        lastEditorMap.set(h.transaction_id, {
          name: changerName || "Unknown",
          has_history: true,
        });
      }
    }

    const formatted = (txnResult.data || []).map((t) => {
      const editor = lastEditorMap.get(t.id);
      const creatorName = (t.creator as unknown as { display_name: string } | null)?.display_name ?? null;

      return {
        id: t.id,
        trip_id: t.trip_id,
        trip_name: (t.trip as unknown as { trip_name: string } | null)?.trip_name ?? null,
        financial_contest_id: (t as Record<string, unknown>).financial_contest_id ?? null,
        contest_name: (t.contest as unknown as { name: string } | null)?.name ?? null,
        type: t.type,
        source: t.source,
        description: t.description,
        amount: Number(t.amount),
        method: t.method,
        notes: t.notes,
        created_by: t.created_by,
        created_by_name: creatorName,
        // Show last editor if edited, otherwise the creator
        attributed_to: editor ? editor.name : creatorName,
        has_history: editor?.has_history ?? false,
        created_at: t.created_at,
      };
    });

    return NextResponse.json({ transactions: formatted });
  } catch (error) {
    console.error("Financial ledger error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
