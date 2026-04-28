// Excel export for the Selection Dashboard.
//
// Sheet 1 ("Selections") matches the on-screen grid: one row per Loozer,
// one column per trip option (grouped), Trip Cost column, totals/summary
// row. Sheet 2 ("Choice counts") is a flat (option, choice, count) table
// useful for catering and other logistics where you just need totals.

interface Choice {
  label: string;
  value: string;
  cost?: number;
}

export interface ExportOption {
  id: string;
  group_id: string;
  name: string;
  option_type: "checkbox" | "select" | "multi_select" | "text" | "number" | "quantity";
  choices?: Choice[];
  cost?: number;
  sort_order: number;
  max_total?: number | null;
}

export interface ExportGroup {
  id: string;
  name: string;
  sort_order: number;
}

export interface ExportParticipant {
  user_id: string;
  display_name: string;
}

export interface ExportSelectionValue {
  value: unknown;
}

export type ExportSelectionsMap = Record<
  string,
  Record<string, ExportSelectionValue>
>;

interface ExportInput {
  tripLabel?: string;
  participants: ExportParticipant[];
  options: ExportOption[];
  groups: ExportGroup[];
  selections: ExportSelectionsMap;
}

const CURRENCY_FMT = '"$"#,##0';

function calcLoozerCost(
  userId: string,
  options: ExportOption[],
  selections: ExportSelectionsMap
): number {
  let total = 0;
  const userSels = selections[userId] || {};

  for (const opt of options) {
    const sel = userSels[opt.id];
    if (!sel) continue;

    if (opt.option_type === "checkbox") {
      if (sel.value === true && opt.cost) total += Number(opt.cost);
    } else if (opt.option_type === "select") {
      const matched = (opt.choices || []).find((c) => c.value === sel.value);
      if (matched?.cost) total += Number(matched.cost);
    } else if (opt.option_type === "multi_select") {
      const arr = Array.isArray(sel.value) ? (sel.value as string[]) : [];
      for (const v of arr) {
        const matched = (opt.choices || []).find((c) => c.value === v);
        if (matched?.cost) total += Number(matched.cost);
      }
    }
  }

  return total;
}

function formatCellValue(
  opt: ExportOption,
  sel: ExportSelectionValue | undefined
): string | number | null {
  if (opt.option_type === "checkbox") {
    return sel?.value === true ? "Y" : "N";
  }
  if (!sel) return null;
  if (opt.option_type === "select") {
    const matched = (opt.choices || []).find((c) => c.value === sel.value);
    return matched ? matched.label : null;
  }
  if (opt.option_type === "multi_select") {
    const arr = Array.isArray(sel.value) ? (sel.value as string[]) : [];
    if (arr.length === 0) return null;
    const labels = arr.map((v) => {
      const matched = (opt.choices || []).find((c) => c.value === v);
      return matched ? matched.label : v;
    });
    return labels.join(", ");
  }
  if (opt.option_type === "number") {
    const n = Number(sel.value);
    return Number.isFinite(n) ? n : null;
  }
  if (opt.option_type === "quantity") {
    const v = sel.value;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const parts: string[] = [];
    for (const c of opt.choices || []) {
      const n = Number((v as Record<string, unknown>)[c.value]);
      if (Number.isFinite(n) && n > 0) parts.push(`${c.label} × ${n}`);
    }
    return parts.length === 0 ? null : parts.join(", ");
  }
  return sel.value == null ? null : String(sel.value);
}

function topCountForColumn(
  opt: ExportOption,
  participants: ExportParticipant[],
  selections: ExportSelectionsMap
): number | null {
  if (opt.option_type === "checkbox") {
    let n = 0;
    for (const p of participants) {
      if (selections[p.user_id]?.[opt.id]?.value === true) n++;
    }
    return n;
  }
  if (opt.option_type === "number") {
    let sum = 0;
    let any = false;
    for (const p of participants) {
      const v = selections[p.user_id]?.[opt.id]?.value;
      const n = Number(v);
      if (Number.isFinite(n)) {
        sum += n;
        any = true;
      }
    }
    return any ? sum : null;
  }
  if (opt.option_type === "quantity") {
    let sum = 0;
    for (const p of participants) {
      const v = selections[p.user_id]?.[opt.id]?.value;
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      for (const n of Object.values(v as Record<string, unknown>)) {
        const num = Number(n);
        if (Number.isFinite(num) && num > 0) sum += num;
      }
    }
    return sum > 0 ? sum : null;
  }
  return null;
}

function buildColumnSummary(
  opt: ExportOption,
  participants: ExportParticipant[],
  selections: ExportSelectionsMap
): string {
  if (opt.option_type === "text") return "";

  if (opt.option_type === "number") {
    const values: number[] = [];
    for (const p of participants) {
      const sel = selections[p.user_id]?.[opt.id];
      if (sel?.value == null || sel.value === "") continue;
      const n = Number(sel.value);
      if (Number.isFinite(n)) values.push(n);
    }
    if (values.length === 0) return "";
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    if (values.length === 1) return `Total: ${sum.toLocaleString()}`;
    const avgStr = avg % 1 === 0 ? avg.toFixed(0) : avg.toFixed(1);
    return `Total: ${sum.toLocaleString()}\nAvg: ${avgStr}`;
  }

  if (opt.option_type === "checkbox") {
    let count = 0;
    for (const p of participants) {
      const sel = selections[p.user_id]?.[opt.id];
      if (sel?.value === true) count++;
    }
    return `${count} / ${participants.length}`;
  }

  const counts = new Map<string, number>();
  for (const c of opt.choices || []) counts.set(c.value, 0);
  for (const p of participants) {
    const sel = selections[p.user_id]?.[opt.id];
    if (!sel) continue;
    if (opt.option_type === "select") {
      const v = sel.value as string;
      if (v && counts.has(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
    } else if (opt.option_type === "multi_select") {
      const arr = Array.isArray(sel.value) ? (sel.value as string[]) : [];
      for (const v of arr) {
        if (counts.has(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    } else if (opt.option_type === "quantity") {
      const v = sel.value;
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
        const num = Number(n);
        if (Number.isFinite(num) && num > 0 && counts.has(k)) {
          counts.set(k, (counts.get(k) ?? 0) + num);
        }
      }
    }
  }

  const lines = (opt.choices || [])
    .map((c) => ({ label: c.label, count: counts.get(c.value) ?? 0 }))
    .filter((x) => x.count > 0);

  return lines.map((l) => `${l.label}: ${l.count}`).join("\n");
}

export async function downloadOptionsExcel(input: ExportInput) {
  const XLSX = await import("xlsx");

  const sortedGroups = [...input.groups].sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const groupedOptions = sortedGroups.map((g) => ({
    group: g,
    options: input.options
      .filter((o) => o.group_id === g.id)
      .sort((a, b) => a.sort_order - b.sort_order),
  }));
  const flatOptions = groupedOptions.flatMap((go) => go.options);

  const sortedParticipants = [...input.participants].sort((a, b) =>
    a.display_name.localeCompare(b.display_name)
  );

  // ── Sheet 1: Selections grid ──────────────────────────────────────────
  const aoa: (string | number | null)[][] = [];

  const exportedAt = new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  aoa.push([
    `Trip Options — Selections${input.tripLabel ? ` (${input.tripLabel})` : ""}`,
  ]);
  aoa.push([`Exported ${exportedAt}`]);
  aoa.push([]);

  // Top counts row (Y-counts for checkboxes, sums for numbers, blank otherwise)
  const countsRow: (string | number | null)[] = [null];
  for (const opt of flatOptions) {
    countsRow.push(topCountForColumn(opt, input.participants, input.selections));
  }
  countsRow.push(null);
  aoa.push(countsRow);

  // Group header row (merges applied later)
  const groupRow: (string | null)[] = [null];
  for (const go of groupedOptions) {
    groupRow.push(go.group.name);
    for (let i = 1; i < go.options.length; i++) groupRow.push(null);
  }
  groupRow.push(null);
  aoa.push(groupRow);

  // Option header row
  const optRow: string[] = ["Loozer"];
  for (const opt of flatOptions) {
    optRow.push(opt.cost ? `${opt.name} ($${opt.cost})` : opt.name);
  }
  optRow.push("Trip Cost");
  aoa.push(optRow);

  const headerRowCount = aoa.length; // rows above data

  // Data rows
  for (const p of sortedParticipants) {
    const row: (string | number | null)[] = [p.display_name];
    for (const opt of flatOptions) {
      row.push(formatCellValue(opt, input.selections[p.user_id]?.[opt.id]));
    }
    row.push(calcLoozerCost(p.user_id, input.options, input.selections));
    aoa.push(row);
  }

  // Totals row
  const totalsRow: (string | number)[] = ["Totals"];
  for (const opt of flatOptions) {
    totalsRow.push(buildColumnSummary(opt, input.participants, input.selections));
  }
  const grandTotal = sortedParticipants.reduce(
    (sum, p) => sum + calcLoozerCost(p.user_id, input.options, input.selections),
    0
  );
  totalsRow.push(grandTotal);
  aoa.push(totalsRow);

  // Per-option summary blocks below the grid (one blank row spacer)
  aoa.push([]);
  aoa.push([]);

  for (const opt of flatOptions) {
    if (opt.option_type === "text") continue;
    const headerLabel = opt.cost ? `${opt.name} ($${opt.cost})` : opt.name;

    if (opt.option_type === "checkbox") {
      let yes = 0;
      for (const p of input.participants) {
        if (input.selections[p.user_id]?.[opt.id]?.value === true) yes++;
      }
      aoa.push([headerLabel, "Count"]);
      aoa.push(["Yes", yes]);
      aoa.push(["No", input.participants.length - yes]);
    } else if (opt.option_type === "number") {
      const values: number[] = [];
      for (const p of input.participants) {
        const v = input.selections[p.user_id]?.[opt.id]?.value;
        const n = Number(v);
        if (Number.isFinite(n)) values.push(n);
      }
      const sum = values.reduce((a, b) => a + b, 0);
      aoa.push([headerLabel, "Value"]);
      aoa.push(["Total", sum]);
      if (values.length > 0) {
        const avg = sum / values.length;
        aoa.push(["Average", Math.round(avg * 10) / 10]);
      }
      aoa.push(["Responses", values.length]);
    } else if (opt.option_type === "quantity") {
      const sums = new Map<string, number>();
      for (const c of opt.choices || []) sums.set(c.value, 0);
      let responders = 0;
      for (const p of input.participants) {
        const v = input.selections[p.user_id]?.[opt.id]?.value;
        if (v === null || v === undefined || typeof v !== "object" || Array.isArray(v)) continue;
        // Any row (including explicit-zero {}) counts as a responder
        responders++;
        for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
          const num = Number(n);
          if (Number.isFinite(num) && num > 0 && sums.has(k)) {
            sums.set(k, (sums.get(k) ?? 0) + num);
          }
        }
      }
      aoa.push([headerLabel, "Quantity"]);
      let blockTotal = 0;
      for (const c of opt.choices || []) {
        const n = sums.get(c.value) ?? 0;
        aoa.push([c.label, n]);
        blockTotal += n;
      }
      aoa.push(["Total", blockTotal]);
      aoa.push(["Responders", responders]);
    } else {
      const counts = new Map<string, number>();
      for (const c of opt.choices || []) counts.set(c.value, 0);
      for (const p of input.participants) {
        const sel = input.selections[p.user_id]?.[opt.id];
        if (!sel) continue;
        if (opt.option_type === "select") {
          const v = sel.value as string;
          if (v && counts.has(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
        } else {
          const arr = Array.isArray(sel.value) ? (sel.value as string[]) : [];
          for (const v of arr) {
            if (counts.has(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
          }
        }
      }
      aoa.push([headerLabel, "Count"]);
      let blockTotal = 0;
      for (const c of opt.choices || []) {
        const n = counts.get(c.value) ?? 0;
        aoa.push([c.label, n]);
        blockTotal += n;
      }
      aoa.push(["Total", blockTotal]);
    }
    aoa.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Merge group header cells (rows shifted by +1 due to inserted counts row)
  const merges: import("xlsx").Range[] = [];
  let col = 1;
  const groupHeaderRowIdx = 4;
  for (const go of groupedOptions) {
    if (go.options.length > 1) {
      merges.push({
        s: { r: groupHeaderRowIdx, c: col },
        e: { r: groupHeaderRowIdx, c: col + go.options.length - 1 },
      });
    }
    col += go.options.length;
  }
  const totalCols = 1 + flatOptions.length + 1;
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } });
  ws["!merges"] = merges;

  // Column widths
  const cols: { wch: number }[] = [{ wch: 24 }]; // Loozer
  for (const opt of flatOptions) {
    const headerLen = (opt.name + (opt.cost ? ` ($${opt.cost})` : "")).length;
    cols.push({
      wch: Math.max(14, Math.min(40, headerLen + 2)),
    });
  }
  cols.push({ wch: 14 }); // Trip Cost
  ws["!cols"] = cols;

  // Apply currency format to the Trip Cost column (last column)
  const tripCostCol = totalCols - 1;
  const dataStartRow = headerRowCount;
  const dataEndRow = dataStartRow + sortedParticipants.length; // includes totals row
  for (let r = dataStartRow; r <= dataEndRow; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: tripCostCol });
    if (ws[addr] && ws[addr].t === "n") {
      ws[addr].z = CURRENCY_FMT;
    }
  }

  // Wrap text on the totals row so multi-line summaries display properly
  const totalsRowIdx = dataEndRow;
  const rowProps: { hpt: number }[] = [];
  for (let r = 0; r <= totalsRowIdx; r++) {
    rowProps.push({ hpt: 18 });
  }
  // Estimate totals row height by max line count
  const totalsLineCount = totalsRow
    .map((v) => (typeof v === "string" ? v.split("\n").length : 1))
    .reduce((a, b) => Math.max(a, b), 1);
  rowProps[totalsRowIdx] = { hpt: Math.max(18, totalsLineCount * 16) };
  ws["!rows"] = rowProps;

  // ── Workbook + download ───────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Options");

  const todayIso = new Date().toISOString().slice(0, 10);
  const fileName = `option-selections-${todayIso}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
