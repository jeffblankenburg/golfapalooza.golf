/**
 * Reduce a zero-sum net-per-player map into the fewest "who pays whom" transfers
 * (#183). Greedy largest-debtor-to-largest-creditor — optimal enough for the small
 * groups these games involve. Amounts in dollars; near-zero noise is ignored.
 */
export interface Transfer {
  from: string; // player id who pays
  to: string; // player id who collects
  amount: number;
}

export function settleUp(net: Record<string, number>): Transfer[] {
  const creditors: { id: string; amt: number }[] = [];
  const debtors: { id: string; amt: number }[] = [];
  for (const [id, v] of Object.entries(net)) {
    if (v > 0.005) creditors.push({ id, amt: v });
    else if (v < -0.005) debtors.push({ id, amt: -v });
  }
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    out.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt <= 0.005) i++;
    if (creditors[j].amt <= 0.005) j++;
  }
  return out;
}
