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
  option_type: "checkbox" | "select" | "multi_select" | "text" | "number";
  choices?: Choice[];
  cost?: number;
  sort_order: number;
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
  if (!sel) return null;

  if (opt.option_type === "checkbox") {
    return sel.value === true ? "Yes" : null;
  }
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
  return sel.value == null ? null : String(sel.value);
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

  // Group header row (merges applied later)
  const groupRow: (string | null)[] = [null]; // empty cell above Loozer column
  for (const go of groupedOptions) {
    groupRow.push(go.group.name);
    for (let i = 1; i < go.options.length; i++) groupRow.push(null);
  }
  groupRow.push(null); // Trip Cost column has no group
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

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Merge group header cells
  const merges: import("xlsx").Range[] = [];
  let col = 1; // column 0 is the Loozer column
  const groupHeaderRowIdx = 3; // 0-based: title, exported, blank, group row
  for (const go of groupedOptions) {
    if (go.options.length > 1) {
      merges.push({
        s: { r: groupHeaderRowIdx, c: col },
        e: { r: groupHeaderRowIdx, c: col + go.options.length - 1 },
      });
    }
    col += go.options.length;
  }
  // Merge the title row across all columns
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

  // ── Sheet 2: Choice counts ────────────────────────────────────────────
  const summaryAoa: (string | number)[][] = [];
  summaryAoa.push(["Option", "Choice", "Count"]);

  for (const opt of flatOptions) {
    if (opt.option_type === "text") continue;

    if (opt.option_type === "checkbox") {
      let count = 0;
      for (const p of input.participants) {
        const sel = input.selections[p.user_id]?.[opt.id];
        if (sel?.value === true) count++;
      }
      summaryAoa.push([opt.name, "Yes", count]);
      continue;
    }

    if (opt.option_type === "number") {
      const values: number[] = [];
      for (const p of input.participants) {
        const sel = input.selections[p.user_id]?.[opt.id];
        if (sel?.value == null || sel.value === "") continue;
        const n = Number(sel.value);
        if (Number.isFinite(n)) values.push(n);
      }
      if (values.length === 0) continue;
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      summaryAoa.push([opt.name, "Total", sum]);
      if (values.length > 1) {
        summaryAoa.push([
          opt.name,
          "Average",
          Math.round(avg * 10) / 10,
        ]);
      }
      continue;
    }

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
    for (const c of opt.choices || []) {
      const n = counts.get(c.value) ?? 0;
      if (n > 0) summaryAoa.push([opt.name, c.label, n]);
    }
  }

  const ws2 = XLSX.utils.aoa_to_sheet(summaryAoa);
  ws2["!cols"] = [{ wch: 28 }, { wch: 24 }, { wch: 8 }];

  // ── Workbook + download ───────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Selections");
  XLSX.utils.book_append_sheet(wb, ws2, "Choice counts");

  const todayIso = new Date().toISOString().slice(0, 10);
  const fileName = `option-selections-${todayIso}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
