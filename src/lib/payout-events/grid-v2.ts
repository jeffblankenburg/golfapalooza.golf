/**
 * Issue #124 — unified Winners-grid loader. Replaces the per-kind
 * dispatch in `grid.ts` with a single read from `contest_winners`.
 *
 * Flow:
 *   1. Load the payout sheet (rows + their contest data).
 *   2. Lazy-materialize each contest-linked row's winners (so the table
 *      always reflects the current scoring state).
 *   3. Read `contest_winners` for those contests in one query.
 *   4. Build cells: one per (user_id, event_id) where contest_winners has
 *      a row. Amount and paid come straight from `contest_winners`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPayoutSheet } from "./compute";
import { materializeContestWinners } from "@/lib/winners/materialize";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

export interface GridLoozer {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface GridEvent {
  key: string;
  label: string;
  sort_order: number;
  is_payout: boolean;
  total: number;
  pickem: boolean;
}

export interface GridCell {
  user_id: string;
  event_key: string;
  amount: number;
  paid: boolean;
}

export interface GridData {
  loozers: GridLoozer[];
  events: GridEvent[];
  cells: GridCell[];
}

export async function loadPayoutGridV2(
  client: Client,
  tripId: string,
): Promise<GridData> {
  const sheet = await loadPayoutSheet(client, tripId);

  // Lazy-materialize: re-derive winners for every contest-linked row.
  // Cheap operations (a few queries per contest) — acceptable on grid
  // load. Fan out in parallel.
  const contestIds = sheet
    .filter((r) => r.contest_id)
    .map((r) => r.contest_id as string);
  await Promise.all(
    contestIds.map((id) =>
      materializeContestWinners(client, id).catch((err) => {
        console.error(`materializeContestWinners(${id}) failed:`, err);
      }),
    ),
  );

  // Load attendees for the loozers axis.
  const { data: rosterRows } = await client
    .from("event_participants")
    .select(
      "user:users!event_participants_user_id_fkey(id, display_name, avatar_url, is_system, is_financial_only)",
    )
    .eq("trip_id", tripId)
    .eq("on_roster", true);

  type UserShape = {
    id: string;
    display_name: string;
    avatar_url: string | null;
    is_system?: boolean;
    is_financial_only?: boolean;
  };

  const loozers: GridLoozer[] = (rosterRows || [])
    .map((r) => {
      const u = (r as { user: UserShape | UserShape[] | null }).user;
      return Array.isArray(u) ? u[0] ?? null : u;
    })
    .filter((u): u is UserShape => !!u && !u.is_system && !u.is_financial_only)
    .map((u) => ({
      user_id: u.id,
      display_name: u.display_name,
      avatar_url: u.avatar_url ?? null,
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  // Pull every winner row across all linked contests in one query.
  const winnersByContest = new Map<
    string,
    Array<{ user_id: string; place: number; amount: number | null; paid: boolean }>
  >();
  if (contestIds.length > 0) {
    const { data: winners } = await client
      .from("contest_winners")
      .select("contest_id, user_id, place, amount, paid")
      .in("contest_id", contestIds);
    for (const w of winners || []) {
      if (!winnersByContest.has(w.contest_id)) winnersByContest.set(w.contest_id, []);
      winnersByContest.get(w.contest_id)!.push({
        user_id: w.user_id,
        place: w.place,
        amount: w.amount === null ? 0 : Number(w.amount),
        paid: !!w.paid,
      });
    }
  }

  const events: GridEvent[] = [];
  const cells: GridCell[] = [];
  for (const row of sheet) {
    events.push({
      key: row.id,
      label: row.label,
      sort_order: row.sort_order,
      is_payout: row.is_payout,
      total: row.total,
      // Pickem column is rendered specially in the UI (separate paid
      // checkbox path historically). We preserve that flag for now so
      // the existing UI keeps rendering correctly.
      pickem: row.contest?.contest_type === "pickem",
    });
    if (!row.contest_id) continue;
    const winners = winnersByContest.get(row.contest_id) || [];
    for (const w of winners) {
      cells.push({
        user_id: w.user_id,
        event_key: row.id,
        amount: w.amount ?? 0,
        paid: w.paid,
      });
    }
  }

  return { loozers, events, cells };
}
