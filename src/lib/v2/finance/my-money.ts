import type { SupabaseClient } from "@supabase/supabase-js";
import { pickName, type NameMode } from "@/lib/v2/profile";
import { loadMemberBalance } from "@/lib/v2/balances";
import { resolveEventPayeeId, resolveContestPayeeId } from "./payees";
import { venmoLink } from "@/lib/v2/payments";

/**
 * Unified "My Money" (finance epic #235 / #237). A member's complete money picture
 * across EVERY event + group contest in the org: their balance + every charge
 * (always shown, like the admin view), PLUS a settle-up layer that nets what they
 * owe each OTHER person and offers a Venmo link. Charges you'd "owe yourself" (you
 * are the treasurer/collector) or that have no assigned payee still show as charges
 * — they just have nobody to Venmo.
 *
 * Obligation sources:
 *   - event trip cost + priced options  → the event's treasurer (default: creator)
 *   - contest buy-ins (event OR group)   → the contest's collector (default: creator)
 *   - ledger charges                     → the row's payee (or event treasurer)
 * Payments are ledger rows; "paid" is whatever's been recorded — never automatic.
 */

const NOTE = "Settle up";

export interface MoneyLine {
  label: string;
  sublabel: string | null;
  amountCents: number;
}
export interface SettleGroup {
  payeeId: string;
  payeeName: string;
  venmoUsername: string | null;
  netCents: number; // > 0 = you owe them; < 0 = they owe you (overpaid)
  venmoUrl: string | null; // prefilled for the outstanding net, if they have Venmo
}
export interface IncomingGroup {
  fromUserId: string;
  fromName: string;
  netCents: number; // what they owe YOU
}
export interface MyMoney {
  balanceCents: number; // total charges − payments (matches the admin balance)
  chargesCents: number;
  paidCents: number;
  charges: MoneyLine[];
  settle: SettleGroup[]; // other people you owe / who owe you
  owedToYouCents: number;
  incoming: IncomingGroup[];
}

interface Prof {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
}

async function names(admin: SupabaseClient, ids: string[], mode: NameMode): Promise<Map<string, string>> {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return new Map();
  const { data } = await admin
    .from("v2_profiles")
    .select("id, display_name, first_name, last_name, nickname, venmo_username")
    .in("id", uniq);
  return new Map((data || []).map((p) => [p.id as string, pickName(p as Prof, mode, "Someone")]));
}

interface Obligation { amountCents: number; label: string; sublabel: string | null; payeeId: string | null; }

export async function loadMyMoney(
  admin: SupabaseClient,
  orgId: string,
  userId: string,
  mode: NameMode,
): Promise<MyMoney> {
  const { data: events } = await admin
    .from("v2_events")
    .select("id, name, created_by, treasurer_user_id")
    .eq("org_id", orgId);
  const evList = events || [];
  const eventPayee = new Map<string, string | null>(evList.map((e) => [e.id as string, resolveEventPayeeId(e)]));
  const eventName = new Map<string, string>(evList.map((e) => [e.id as string, (e.name as string) || "Event"]));

  const obligations: Obligation[] = [];
  const paidByPayee = new Map<string, number>();

  // 1) Event derived charges (trip cost + priced options) → event treasurer.
  for (const e of evList) {
    const bal = await loadMemberBalance(admin, e.id as string, userId);
    const payeeId = eventPayee.get(e.id as string) ?? null;
    for (const c of bal.charges) {
      if (c.derived) obligations.push({ amountCents: c.amountCents, label: c.label, sublabel: eventName.get(e.id as string) || null, payeeId });
    }
  }

  // 2) GROUP contest buy-ins (event_id null) → the contest's collector. EVENT
  // contest buy-ins flow through Options (cost_items) and are already in the derived
  // charges above (there's no entry_amount_cents column — removed in 00250). Group
  // contests have no Options, so their fee lives in config.entry_cents and is
  // DERIVED here; only the payments against it are stored in the ledger.
  const { data: parts } = await admin.from("v2_contest_participants").select("contest_id").eq("user_id", userId);
  const contestIds = [...new Set((parts || []).map((p) => p.contest_id as string))];
  if (contestIds.length) {
    const { data: contests } = await admin
      .from("v2_contests")
      .select("id, name, config, collected_by, created_by")
      .in("id", contestIds)
      .eq("org_id", orgId)
      .is("event_id", null);
    for (const c of contests || []) {
      const entry = Number((c.config as { entry_cents?: number } | null)?.entry_cents) || 0;
      if (entry <= 0) continue;
      obligations.push({ amountCents: entry, label: (c.name as string) || "Contest", sublabel: "Entry fee", payeeId: resolveContestPayeeId(c, null) });
    }
  }

  // 2b) Boxes (Squares) buy-ins (event-less) → the pool's collector. Ownership is
  // cells in v2_boxes_cells (NOT contest_participants), and the fee is per-square
  // (config.cell_cost_cents) × squares owned.
  const { data: myCells } = await admin.from("v2_boxes_cells").select("contest_id").eq("user_id", userId);
  const cellsByContest = new Map<string, number>();
  for (const c of myCells || []) cellsByContest.set(c.contest_id as string, (cellsByContest.get(c.contest_id as string) || 0) + 1);
  if (cellsByContest.size) {
    const { data: boxes } = await admin
      .from("v2_contests")
      .select("id, name, config, collected_by, created_by")
      .in("id", [...cellsByContest.keys()])
      .eq("org_id", orgId)
      .is("event_id", null)
      .eq("contest_type", "boxes");
    for (const b of boxes || []) {
      const cost = Number((b.config as { cell_cost_cents?: number } | null)?.cell_cost_cents) || 0;
      const n = cellsByContest.get(b.id as string) || 0;
      const amt = cost * n;
      if (amt <= 0) continue;
      obligations.push({ amountCents: amt, label: (b.name as string) || "Squares", sublabel: `${n} square${n === 1 ? "" : "s"}`, payeeId: resolveContestPayeeId(b, null) });
    }
  }

  // 3) Ledger charges + payments for this member, org-wide, attributed by payee.
  const { data: txs } = await admin
    .from("v2_financial_transactions")
    .select("type, amount_cents, description, payee_user_id, event_id")
    .eq("org_id", orgId)
    .eq("user_id", userId);
  for (const t of txs || []) {
    const payeeId = (t.payee_user_id as string | null) ?? (t.event_id ? eventPayee.get(t.event_id as string) ?? null : null);
    const amt = (t.amount_cents as number) || 0;
    if (t.type === "charge") obligations.push({ amountCents: amt, label: (t.description as string) || "Charge", sublabel: null, payeeId });
    else if (payeeId) paidByPayee.set(payeeId, (paidByPayee.get(payeeId) || 0) + amt);
  }

  // Charges list (always shown) + totals.
  const charges: MoneyLine[] = obligations.map((o) => ({ label: o.label, sublabel: o.sublabel, amountCents: o.amountCents }));
  const chargesCents = obligations.reduce((s, o) => s + o.amountCents, 0);
  const paidCents = [...paidByPayee.values()].reduce((s, v) => s + v, 0);
  const balanceCents = chargesCents - paidCents;

  // Settle-up: net per OTHER payee (skip yourself + unassigned).
  const owedByPayee = new Map<string, number>();
  for (const o of obligations) {
    if (!o.payeeId || o.payeeId === userId) continue;
    owedByPayee.set(o.payeeId, (owedByPayee.get(o.payeeId) || 0) + o.amountCents);
  }
  const settlePayeeIds = new Set<string>([...owedByPayee.keys()]);
  for (const pid of paidByPayee.keys()) if (pid !== userId) settlePayeeIds.add(pid);

  const nameMap = await names(admin, [...settlePayeeIds], mode);
  const venmoById = new Map<string, string | null>();
  if (settlePayeeIds.size) {
    const { data: vrows } = await admin.from("v2_profiles").select("id, venmo_username").in("id", [...settlePayeeIds]);
    for (const v of vrows || []) venmoById.set(v.id as string, (v.venmo_username as string | null) || null);
  }

  const settle: SettleGroup[] = [...settlePayeeIds]
    .map((pid) => {
      const net = (owedByPayee.get(pid) || 0) - (paidByPayee.get(pid) || 0);
      const venmo = venmoById.get(pid) ?? null;
      return {
        payeeId: pid,
        payeeName: nameMap.get(pid) || "Someone",
        venmoUsername: venmo,
        netCents: net,
        venmoUrl: net > 0 ? venmoLink(venmo, net, NOTE) : null,
      };
    })
    .filter((g) => g.netCents !== 0)
    .sort((a, b) => b.netCents - a.netCents);

  const incoming = await loadGroupContestIncoming(admin, orgId, userId, mode);
  const owedToYouCents = incoming.reduce((s, g) => s + g.netCents, 0);

  return { balanceCents, chargesCents, paidCents, charges, settle, owedToYouCents, incoming };
}

/** What others owe this member for GROUP contests they collect — Pick'em (flat
 *  entry per participant) + Boxes (per-square cost × squares owned), minus any
 *  payments recorded to this member for that contest. */
async function loadGroupContestIncoming(
  admin: SupabaseClient,
  orgId: string,
  userId: string,
  mode: NameMode,
): Promise<IncomingGroup[]> {
  // Group contests this member is the resolved collector of (explicit, or creator).
  const { data: contests } = await admin
    .from("v2_contests")
    .select("id, contest_type, config, collected_by, created_by")
    .eq("org_id", orgId)
    .is("event_id", null);
  const mine = (contests || []).filter((c) => resolveContestPayeeId(c, null) === userId);
  if (!mine.length) return [];

  const owedByUser = new Map<string, number>(); // debtor → what they owe me
  const allIds: string[] = [];
  const add = (u: string, cents: number) => {
    if (u === userId || cents <= 0) return;
    owedByUser.set(u, (owedByUser.get(u) || 0) + cents);
  };

  // Pick'em: flat entry per enrolled participant.
  const pickemFee = new Map<string, number>();
  for (const c of mine) {
    if (c.contest_type !== "pickem") continue;
    const fee = Number((c.config as { entry_cents?: number } | null)?.entry_cents) || 0;
    if (fee > 0) { pickemFee.set(c.id as string, fee); allIds.push(c.id as string); }
  }
  if (pickemFee.size) {
    const { data: parts } = await admin.from("v2_contest_participants").select("contest_id, user_id").in("contest_id", [...pickemFee.keys()]);
    for (const p of parts || []) add(p.user_id as string, pickemFee.get(p.contest_id as string) || 0);
  }

  // Boxes: per-square cost × squares each member owns.
  const boxesCost = new Map<string, number>();
  for (const c of mine) {
    if (c.contest_type !== "boxes") continue;
    const cost = Number((c.config as { cell_cost_cents?: number } | null)?.cell_cost_cents) || 0;
    if (cost > 0) { boxesCost.set(c.id as string, cost); allIds.push(c.id as string); }
  }
  if (boxesCost.size) {
    const { data: cells } = await admin.from("v2_boxes_cells").select("contest_id, user_id").in("contest_id", [...boxesCost.keys()]).not("user_id", "is", null);
    for (const x of cells || []) add(x.user_id as string, boxesCost.get(x.contest_id as string) || 0);
  }

  // Subtract payments recorded to me for these contests.
  if (allIds.length) {
    const { data: pays } = await admin.from("v2_financial_transactions").select("user_id, amount_cents, contest_id").eq("type", "payment").eq("payee_user_id", userId).in("contest_id", allIds);
    for (const pay of pays || []) {
      const u = pay.user_id as string;
      if (!owedByUser.has(u)) continue;
      owedByUser.set(u, (owedByUser.get(u) || 0) - ((pay.amount_cents as number) || 0));
    }
  }

  const debtors = [...owedByUser.entries()].filter(([, net]) => net > 0);
  const nameMap = await names(admin, debtors.map(([u]) => u), mode);
  return debtors
    .map(([fromUserId, netCents]) => ({ fromUserId, fromName: nameMap.get(fromUserId) || "Someone", netCents }))
    .sort((a, b) => b.netCents - a.netCents);
}
