/**
 * Group-wide admin financial rollup (#237, final slice). One board that nets EVERY
 * member's money across the whole org — every event (trip cost + options + event
 * ledger) PLUS every group contest buy-in (Pick'em entry, Squares squares) and any
 * group-level ledger rows. The member-facing mirror is loadMyMoney; this is the
 * admin's "who owes what, across everything" view.
 *
 * Partition (no double counting):
 *   - event-scoped money  → loadEventBalances per event (derived + event ledger)
 *   - group contest buy-ins → derived here from participation
 *   - group ledger (event_id NULL) → charges add to owed, payments to paid
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEventBalances } from "@/lib/v2/balances";

export interface OrgBalanceLine {
  label: string;
  amountCents: number;        // owed for this line
  eventId?: string;           // event money → deep-link to that event's Balances page
  contestId?: string;         // group contest → inline mark-paid (via /contests/{id}/payments)
  contestPaidCents?: number;  // group contest → recorded so far (drives the toggle state)
}
export interface OrgBalanceRow {
  userId: string;
  owedCents: number;
  paidCents: number;
  balanceCents: number; // owed − paid (positive = owes)
  lines: OrgBalanceLine[]; // owed breakdown (events, contests, charges)
}

export async function loadOrgBalances(admin: SupabaseClient, orgId: string): Promise<OrgBalanceRow[]> {
  const owed = new Map<string, number>();
  const paid = new Map<string, number>();
  const lines = new Map<string, OrgBalanceLine[]>();
  const addOwed = (uid: string, cents: number, label: string, ref?: { eventId?: string; contestId?: string }) => {
    if (!uid || cents <= 0) return;
    owed.set(uid, (owed.get(uid) || 0) + cents);
    (lines.get(uid) ?? lines.set(uid, []).get(uid)!).push({ label, amountCents: cents, ...ref });
  };
  const addPaid = (uid: string, cents: number) => {
    if (!uid || cents <= 0) return;
    paid.set(uid, (paid.get(uid) || 0) + cents);
  };

  // 1) Every event's per-member balance (derived charges + that event's ledger).
  const { data: events } = await admin.from("v2_events").select("id, name").eq("org_id", orgId);
  const evList = events || [];
  const evBalances = await Promise.all(
    evList.map((e) => loadEventBalances(admin, e.id as string).then((rows) => ({ id: e.id as string, name: (e.name as string) || "Event", rows }))),
  );
  for (const { id, name, rows } of evBalances) {
    for (const r of rows) {
      addOwed(r.userId, r.owedCents, name, { eventId: id });
      addPaid(r.userId, r.paidCents);
    }
  }

  // 2) Group contest buy-ins (event_id NULL): Pick'em entry per participant,
  //    Squares per-square cost × squares owned.
  const { data: gcontests } = await admin
    .from("v2_contests")
    .select("id, name, contest_type, config")
    .eq("org_id", orgId)
    .is("event_id", null);

  const pickemFee = new Map<string, number>();
  const squaresCost = new Map<string, number>();
  const contestName = new Map<string, string>();
  for (const c of gcontests || []) {
    contestName.set(c.id as string, (c.name as string) || "Contest");
    if (c.contest_type === "pickem") {
      const fee = Number((c.config as { entry_cents?: number } | null)?.entry_cents) || 0;
      if (fee > 0) pickemFee.set(c.id as string, fee);
    } else if (c.contest_type === "squares") {
      const cost = Number((c.config as { cell_cost_cents?: number } | null)?.cell_cost_cents) || 0;
      if (cost > 0) squaresCost.set(c.id as string, cost);
    }
  }

  if (pickemFee.size) {
    const { data: parts } = await admin.from("v2_contest_participants").select("contest_id, user_id").in("contest_id", [...pickemFee.keys()]);
    for (const p of parts || []) addOwed(p.user_id as string, pickemFee.get(p.contest_id as string) || 0, contestName.get(p.contest_id as string) || "Contest", { contestId: p.contest_id as string });
  }
  if (squaresCost.size) {
    const { data: cells } = await admin.from("v2_squares_cells").select("contest_id, user_id").in("contest_id", [...squaresCost.keys()]).not("user_id", "is", null);
    const perUserContest = new Map<string, number>(); // "uid|cid" → squares
    for (const x of cells || []) {
      const k = `${x.user_id}|${x.contest_id}`;
      perUserContest.set(k, (perUserContest.get(k) || 0) + 1);
    }
    for (const [k, n] of perUserContest) {
      const [uid, cid] = k.split("|");
      const amt = (squaresCost.get(cid) || 0) * n;
      addOwed(uid, amt, `${contestName.get(cid) || "Squares"} (${n} sq)`, { contestId: cid });
    }
  }

  // Per-(member, group contest) recorded entry payments (source='deposit'), so the
  // admin board can show paid/outstanding + an inline mark-paid toggle on each group
  // contest line. These dollars are ALREADY in `paid` via step 3's event_id-NULL
  // ledger scan — this is a display-only breakdown, never re-added to totals.
  const groupContestIds = [...new Set([...pickemFee.keys(), ...squaresCost.keys()])];
  if (groupContestIds.length) {
    const { data: deposits } = await admin
      .from("v2_financial_transactions")
      .select("user_id, contest_id, amount_cents")
      .in("contest_id", groupContestIds)
      .eq("type", "payment")
      .eq("source", "deposit");
    const paidByUserContest = new Map<string, number>(); // "uid|cid" → cents
    for (const d of deposits || []) {
      const k = `${d.user_id}|${d.contest_id}`;
      paidByUserContest.set(k, (paidByUserContest.get(k) || 0) + ((d.amount_cents as number) || 0));
    }
    for (const [uid, userLines] of lines) {
      for (const l of userLines) {
        if (l.contestId) l.contestPaidCents = paidByUserContest.get(`${uid}|${l.contestId}`) || 0;
      }
    }
  }

  // 3) Group-level ledger (event_id NULL): charges → owed, payments → paid. Event
  //    ledger rows are already folded into step 1 via loadEventBalances.
  const { data: txs } = await admin
    .from("v2_financial_transactions")
    .select("user_id, type, amount_cents, description")
    .eq("org_id", orgId)
    .is("event_id", null);
  for (const t of txs || []) {
    const uid = t.user_id as string;
    const amt = (t.amount_cents as number) || 0;
    if (t.type === "charge") addOwed(uid, amt, (t.description as string) || "Charge");
    else addPaid(uid, amt);
  }

  // Everyone with any activity (owed or paid). Members at $0 don't clutter the board.
  const userIds = new Set<string>([...owed.keys(), ...paid.keys()]);
  return [...userIds].map((uid) => {
    const o = owed.get(uid) || 0;
    const p = paid.get(uid) || 0;
    return { userId: uid, owedCents: o, paidCents: p, balanceCents: o - p, lines: lines.get(uid) || [] };
  });
}
