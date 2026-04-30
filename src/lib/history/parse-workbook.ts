// Parser for `Golfapalooza History.xlsx` (issue #114).
//
// Pure data layer — takes a workbook buffer, returns typed JS objects.
// No DB calls, no filesystem reads. Callers (admin API routes, CLI scripts)
// are responsible for getting the buffer here.
//
// Phase 1a scope: Awards sheet + the union of every workbook_name appearing
// in any sheet (so the matcher can offer the full reconciliation list even
// though only awards land in the DB on the first pass).

import * as XLSX from "xlsx";

export type AwardCategory =
  | "mvl"
  | "roy"
  | "melc"
  | "bspitw"
  | "green_jacket"
  | "cornhole_singles"
  | "cornhole_doubles";

export interface ParsedTrip {
  year: number;
  generation: string; // 'GI', 'GII', ... 'GXXVIII'
}

export interface ParsedLoozer {
  workbookName: string; // 'JeffBlankenburg' (no spaces)
  firstName: string;
  lastName: string;
  sheetsAppearedIn: string[]; // for diagnostics
  /** Expected per-category award counts from the Summary sheet, when present. */
  expectedAwardCounts?: Partial<Record<AwardCategory, number>>;
  /** Years attended per Summary sheet (when present). */
  yearsAttendedExpected?: number;
}

export interface ParsedAward {
  year: number;
  category: AwardCategory;
  workbookName: string; // winner
  partnerWorkbookName?: string; // doubles cornhole only
}

export interface ParsedWorkbook {
  trips: ParsedTrip[];
  loozers: ParsedLoozer[];
  awards: ParsedAward[];
  warnings: string[]; // non-fatal data quirks (typos, blanks, etc.)
}

// Workbook name normalization. The XLSX has at least two known typos
// (`Erickaniecki` lowercase k in 2021/2022 awards). We canonicalize on parse
// so downstream code works with one form. Source of truth lives here.
const NAME_FIXES: Record<string, string> = {
  Erickaniecki: "EricKaniecki",
  StaceyBartlett: "StaceyBartlett", // appears as both spellings; preserve
  StacyBartlett: "StaceyBartlett", // canonicalize to the more common form
};

function fixName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return NAME_FIXES[trimmed] ?? trimmed;
}

// Roughly split a CamelCase workbook name into first/last. Best-effort; the
// matcher is the human-in-the-loop fallback so a wrong split doesn't block.
function splitName(workbookName: string): { firstName: string; lastName: string } {
  const m = workbookName.match(/^([A-Z][a-z]+)(.+)$/);
  if (!m) return { firstName: workbookName, lastName: "" };
  return { firstName: m[1], lastName: m[2] };
}

// Sheets that have a per-row `workbookName` value we care about, and the
// 0-indexed column where that value lives.
const NAME_COLUMNS: Array<{ sheet: string; col: number; headerRows: number }> = [
  { sheet: "Summary", col: 2, headerRows: 1 },
  { sheet: "Attendance", col: 2, headerRows: 1 },
  { sheet: "Indv Rounds", col: 0, headerRows: 1 },
  { sheet: "Indv Average", col: 2, headerRows: 1 },
  { sheet: "Indv Best", col: 2, headerRows: 2 }, // two header rows (MIN, PAR)
  { sheet: "Scramble Rounds", col: 2, headerRows: 2 },
];

// === Awards parsing ==========================================================

// The Awards sheet has 10 columns:
//   0=Year, 1=Generation, 2=MVL, 3=ROY, 4=MELC, 5=Green Jacket, 6=BSPITW,
//   7=Singles cornhole, 8=Doubles winner, 9=Doubles partner.
// 2015 has TWO rows in the workbook (the second row only sets MELC = a second
// MELC winner). We accumulate awards row-by-row and emit one ParsedAward per
// non-null winner cell.
function parseAwards(sheet: XLSX.WorkSheet): {
  trips: ParsedTrip[];
  awards: ParsedAward[];
  warnings: string[];
} {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: null,
  });
  const tripsByYear = new Map<number, string>();
  const awards: ParsedAward[] = [];
  const warnings: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as Array<string | null>;
    if (!r) continue;
    const yearStr = r[0];
    if (!yearStr) continue;
    const year = parseInt(String(yearStr), 10);
    if (!Number.isFinite(year)) continue;

    const generation = r[1] ? String(r[1]).trim() : null;
    if (generation && !tripsByYear.has(year)) {
      tripsByYear.set(year, generation);
    } else if (generation && tripsByYear.get(year) !== generation) {
      warnings.push(
        `Year ${year} has conflicting generation values: ${tripsByYear.get(year)} vs ${generation}`,
      );
    }

    const push = (
      category: AwardCategory,
      winner: string | null,
      partner: string | null = null,
    ) => {
      const w = fixName(winner);
      if (!w) return;
      const p = fixName(partner) ?? undefined;
      awards.push({ year, category, workbookName: w, partnerWorkbookName: p });
    };

    push("mvl", r[2]);
    push("roy", r[3]);
    push("melc", r[4]);
    push("green_jacket", r[5]);
    push("bspitw", r[6]);
    push("cornhole_singles", r[7]);
    // Doubles: r[8] is one teammate, r[9] is the other. Either can be the
    // "primary" winner — we record one accolades row per team with both.
    if (r[8] || r[9]) {
      const a = fixName(r[8]);
      const b = fixName(r[9]);
      if (a) push("cornhole_doubles", a, b);
      else if (b) push("cornhole_doubles", b, null);
    }
  }

  // Apply known generation typo fix.
  if (tripsByYear.get(2004) === "GVII" && tripsByYear.get(2003) === "GVII") {
    tripsByYear.set(2004, "GVIII");
    warnings.push("Patched workbook typo: 2004 generation changed from GVII to GVIII");
  }

  const trips = [...tripsByYear.entries()]
    .map(([year, generation]) => ({ year, generation }))
    .sort((a, b) => a.year - b.year);

  return { trips, awards, warnings };
}

// === Loozer name harvesting ==================================================

function harvestLoozers(wb: XLSX.WorkBook, awards: ParsedAward[]): {
  loozers: ParsedLoozer[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const seen = new Map<string, ParsedLoozer>();

  const recordName = (name: string | null, sheet: string) => {
    const fixed = fixName(name);
    if (!fixed) return;
    const existing = seen.get(fixed);
    if (existing) {
      if (!existing.sheetsAppearedIn.includes(sheet))
        existing.sheetsAppearedIn.push(sheet);
      return;
    }
    const { firstName, lastName } = splitName(fixed);
    seen.set(fixed, {
      workbookName: fixed,
      firstName,
      lastName,
      sheetsAppearedIn: [sheet],
    });
  };

  for (const { sheet, col, headerRows } of NAME_COLUMNS) {
    const ws = wb.Sheets[sheet];
    if (!ws) {
      warnings.push(`Expected sheet "${sheet}" not found`);
      continue;
    }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: false,
      defval: null,
    });
    for (let i = headerRows; i < rows.length; i++) {
      const r = rows[i] as Array<string | null>;
      recordName(r?.[col] ?? null, sheet);
    }
  }

  // Award winners and partners always count even if they don't appear in the
  // per-row sheets above.
  for (const a of awards) {
    recordName(a.workbookName, "Awards");
    if (a.partnerWorkbookName) recordName(a.partnerWorkbookName, "Awards");
  }

  // Get first/last names + expected award counts from the Summary sheet.
  // Columns: 0=First, 1=Last, 2=Loozer, 3=Years, 4=MVL, 5=ROY, 6=MELC,
  // 7=BSPITW, 8=Green Jacket, 9=Singles Cornhole, 10=Doubles Cornhole.
  const summary = wb.Sheets["Summary"];
  if (summary) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(summary, {
      header: 1,
      raw: false,
      defval: null,
    });
    const toInt = (cell: string | null | undefined): number | undefined => {
      if (cell == null || cell === "") return undefined;
      const n = parseInt(String(cell).trim(), 10);
      return Number.isFinite(n) ? n : undefined;
    };
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] as Array<string | null>;
      const first = r?.[0];
      const last = r?.[1];
      const wbn = fixName(r?.[2] ?? null);
      if (!wbn) continue;
      const entry = seen.get(wbn);
      if (!entry) continue;
      if (first) entry.firstName = String(first).trim();
      if (last) entry.lastName = String(last).trim();

      const counts: Partial<Record<AwardCategory, number>> = {};
      const cells: Array<[AwardCategory, number]> = [
        ["mvl", 4],
        ["roy", 5],
        ["melc", 6],
        ["bspitw", 7],
        ["green_jacket", 8],
        ["cornhole_singles", 9],
        ["cornhole_doubles", 10],
      ];
      for (const [cat, col] of cells) {
        const v = toInt(r?.[col]);
        if (v !== undefined) counts[cat] = v;
      }
      if (Object.keys(counts).length > 0) entry.expectedAwardCounts = counts;
      const yrs = toInt(r?.[3]);
      if (yrs !== undefined) entry.yearsAttendedExpected = yrs;
    }
  }

  return {
    loozers: [...seen.values()].sort((a, b) =>
      a.workbookName.localeCompare(b.workbookName),
    ),
    warnings,
  };
}

// === Top-level entry point ===================================================

export function parseWorkbook(buffer: Buffer | ArrayBuffer): ParsedWorkbook {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const awardsSheet = wb.Sheets["Awards"];
  if (!awardsSheet) {
    throw new Error("Workbook is missing the required Awards sheet");
  }

  const { trips, awards, warnings: awardsWarnings } = parseAwards(awardsSheet);
  const { loozers, warnings: loozerWarnings } = harvestLoozers(wb, awards);

  return {
    trips,
    loozers,
    awards,
    warnings: [...awardsWarnings, ...loozerWarnings],
  };
}
