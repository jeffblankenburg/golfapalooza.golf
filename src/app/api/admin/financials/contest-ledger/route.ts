import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

// GET - Transactions for a specific user + financial contest, trip, or uncategorized
export async function GET(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");
  const contestId = searchParams.get("financial_contest_id");
  const tripId = searchParams.get("trip_id");
  const uncategorized = searchParams.get("uncategorized");

  if (!userId || (!contestId && !tripId && !uncategorized)) {
    return NextResponse.json(
      { error: "user_id and either financial_contest_id, trip_id, or uncategorized are required" },
      { status: 400 }
    );
  }

  try {
    const adminClient = createAdminClient();

    let query = adminClient
      .from("financial_transactions")
      .select(
        "id, type, source, description, amount, method, notes, created_at, created_by, creator:users!financial_transactions_created_by_fkey(display_name)"
      )
      .eq("user_id", userId);

    if (uncategorized) {
      query = query.is("financial_contest_id", null).is("trip_id", null);
    } else if (contestId) {
      query = query.eq("financial_contest_id", contestId);
    } else if (tripId) {
      query = query.eq("trip_id", tripId);
    }

    const { data: transactions, error } = await query.order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch history for these transactions
    const txnIds = (transactions || []).map((t) => t.id);
    let lastEditorMap = new Map<string, { name: string; has_history: boolean }>();

    if (txnIds.length > 0) {
      const { data: history } = await adminClient
        .from("financial_transaction_history")
        .select("transaction_id, changed_by, changed_at, changer:users!financial_transaction_history_changed_by_fkey(display_name)")
        .in("transaction_id", txnIds)
        .order("changed_at", { ascending: false });

      for (const h of history || []) {
        if (!lastEditorMap.has(h.transaction_id)) {
          const changerName = (h.changer as unknown as { display_name: string } | null)?.display_name ?? null;
          lastEditorMap.set(h.transaction_id, {
            name: changerName || "Unknown",
            has_history: true,
          });
        }
      }
    }

    const formatted = (transactions || []).map((t) => {
      const editor = lastEditorMap.get(t.id);
      const creatorName = (t.creator as unknown as { display_name: string } | null)?.display_name ?? null;

      return {
        ...t,
        creator: undefined,
        created_by_name: creatorName,
        attributed_to: editor ? editor.name : creatorName,
        has_history: editor?.has_history ?? false,
      };
    });

    return NextResponse.json({ transactions: formatted });
  } catch (error) {
    console.error("Contest ledger error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
