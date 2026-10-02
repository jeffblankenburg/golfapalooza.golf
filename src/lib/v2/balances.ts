/**
 * Member balances (#214, final slice). Mirrors v1's "My Financials" / admin Balances,
 * but adapted to v2's DERIVED-charge money model: a member's charges are computed live
 * (Trip Cost if on-roster + each selected Option's current price), never stored. The
 * ledger (`v2_financial_transactions`) stores ONLY non-derivable money — payments,
 * credits, winnings, and manual/expense/adjustment charges.
 *
 *   owed    = derived charges + ledger charges
 *   paid    = ledger payments
 *   balance = owed − paid           (positive = the member owes)
 *
 * v1 refs: src/app/api/financials/me/route.ts, src/components/MyFinancials.tsx,
 * src/components/admin/FinancialGrid.tsx.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OPTION_SELECT, loadOptionChoicePrices, priceForValue, tripCostCents,
  selectedChoiceValues, type Option,
} from "@/lib/v2/options";

export interface BalanceLine {
  label: string;
  sublabel: string | null;
  amountCents: number;
  derived: boolean; // true = Trip Cost / option (not a stored ledger row)
}
export interface LedgerTx {
  id: string;
  type: "charge" | "payment";
  source: string;
  amountCents: number;
  description: string | null;
  method: string | null;
  notes: string | null;
  createdAt: string;
}
export interface MemberBalance {
  userId: string;
  onRoster: boolean;
  charges: BalanceLine[]; // derived (Trip Cost + options) + ledger charges
  payments: LedgerTx[];   // ledger payment rows
  owedCents: number;
  paidCents: number;
  balanceCents: number;   // owed − paid (positive = owes)
}

/** Friendly label for a ledger source when a row has no description. */
export function sourceLabel(source: string): string {
  switch (source) {
    case "deposit": return "Payment";
    case "winnings": return "Winnings";
    case "credit": return "Credit";
    case "expense": return "Expense";
    case "contest_entry": return "Entry fee";
    case "adjustment": return "Adjustment";
    default: return "Charge";
  }
}

function choiceSublabel(o: Option, value: unknown): string | null {
  if (!o.choices?.length) return null;
  const vals = selectedChoiceValues(o.option_type, value);
  if (!vals.size) return null;
  const labels = o.choices.filter((c) => vals.has(c.value)).map((c) => c.label);
  return labels.length ? labels.join(", ") : null;
}

/** Full balance breakdown for one member (the member-facing view). */
export async function loadMemberBalance(
  admin: SupabaseClient,
  eventId: string,
  userId: string,
): Promise<MemberBalance> {
  const [{ data: part }, { data: opts }, { data: sels }, { data: txs }, tripCost] = await Promise.all([
    admin.from("v2_event_participants").select("on_roster").eq("event_id", eventId).eq("user_id", userId).maybeSingle(),
    admin.from("v2_options").select(OPTION_SELECT).eq("event_id", eventId).order("sort_order"),
    admin.from("v2_user_option_selections").select("option_id, value").eq("event_id", eventId).eq("user_id", userId),
    admin.from("v2_financial_transactions").select("id, type, source, amount_cents, description, method, notes, created_at").eq("event_id", eventId).eq("user_id", userId).order("created_at", { ascending: false }),
    tripCostCents(admin, eventId),
  ]);

  const onRoster = part?.on_roster === true;
  const options = (opts || []) as Option[];
  const priceInfo = await loadOptionChoicePrices(admin, options.map((o) => o.id));
  const selByOption = new Map((sels || []).map((s) => [s.option_id as string, s.value]));

  // Trip Cost is just a selectable option (v1 parity) — it's a charge when SELECTED,
  // priced from the derived tripCost; every other selected option prices normally.
  const charges: BalanceLine[] = [];
  for (const o of options) {
    if (!selByOption.has(o.id)) continue;
    if (o.option_type === "trip_cost") {
      charges.push({ label: o.name || "Trip Cost", sublabel: null, amountCents: tripCost, derived: true });
      continue;
    }
    const value = selByOption.get(o.id);
    const info = priceInfo.get(o.id) || { whole: 0, byChoice: {} };
    charges.push({ label: o.name, sublabel: choiceSublabel(o, value), amountCents: priceForValue(o.option_type, value, info), derived: true });
  }

  const payments: LedgerTx[] = [];
  for (const t of txs || []) {
    const tx: LedgerTx = {
      id: t.id as string, type: t.type as "charge" | "payment", source: t.source as string,
      amountCents: (t.amount_cents as number) || 0, description: (t.description as string | null) ?? null,
      method: (t.method as string | null) ?? null, notes: (t.notes as string | null) ?? null, createdAt: t.created_at as string,
    };
    if (tx.type === "charge") charges.push({ label: tx.description || sourceLabel(tx.source), sublabel: null, amountCents: tx.amountCents, derived: false });
    else payments.push(tx);
  }

  const owedCents = charges.reduce((s, l) => s + l.amountCents, 0);
  const paidCents = payments.reduce((s, p) => s + p.amountCents, 0);
  return { userId, onRoster, charges, payments, owedCents, paidCents, balanceCents: owedCents - paidCents };
}

export interface EventBalanceRow {
  userId: string;
  onRoster: boolean;
  owedCents: number;
  paidCents: number;
  balanceCents: number;
}

/** Per-member balance rollup for the whole event (the admin Balances grid). */
export async function loadEventBalances(admin: SupabaseClient, eventId: string): Promise<EventBalanceRow[]> {
  const [{ data: parts }, { data: opts }, { data: sels }, { data: txs }, tripCost] = await Promise.all([
    admin.from("v2_event_participants").select("user_id, on_roster").eq("event_id", eventId),
    admin.from("v2_options").select("id, option_type").eq("event_id", eventId),
    admin.from("v2_user_option_selections").select("user_id, option_id, value").eq("event_id", eventId),
    admin.from("v2_financial_transactions").select("user_id, type, amount_cents").eq("event_id", eventId),
    tripCostCents(admin, eventId),
  ]);

  const onRosterSet = new Set((parts || []).filter((p) => p.on_roster).map((p) => p.user_id as string));
  const options = (opts || []) as { id: string; option_type: Option["option_type"] }[];
  const optType = new Map(options.map((o) => [o.id, o.option_type]));
  const priceInfo = await loadOptionChoicePrices(admin, options.map((o) => o.id));

  // Each selected option is a charge; Trip Cost (selected) prices from the derived total.
  const optCharge = new Map<string, number>();
  for (const s of sels || []) {
    const t = optType.get(s.option_id as string);
    if (!t) continue;
    const amt = t === "trip_cost" ? tripCost : priceForValue(t, s.value, priceInfo.get(s.option_id as string) || { whole: 0, byChoice: {} });
    optCharge.set(s.user_id as string, (optCharge.get(s.user_id as string) || 0) + amt);
  }
  const ledgerCharge = new Map<string, number>();
  const ledgerPay = new Map<string, number>();
  for (const t of txs || []) {
    const uid = t.user_id as string;
    if (t.type === "charge") ledgerCharge.set(uid, (ledgerCharge.get(uid) || 0) + ((t.amount_cents as number) || 0));
    else ledgerPay.set(uid, (ledgerPay.get(uid) || 0) + ((t.amount_cents as number) || 0));
  }

  const userIds = new Set<string>([...onRosterSet]);
  for (const s of sels || []) userIds.add(s.user_id as string);
  for (const t of txs || []) userIds.add(t.user_id as string);

  return [...userIds].map((uid) => {
    const owed = (optCharge.get(uid) || 0) + (ledgerCharge.get(uid) || 0);
    const paid = ledgerPay.get(uid) || 0;
    return { userId: uid, onRoster: onRosterSet.has(uid), owedCents: owed, paidCents: paid, balanceCents: owed - paid };
  });
}
