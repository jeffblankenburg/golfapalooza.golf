#!/usr/bin/env node
// Read-only probe of Golfapalooza History.xlsx — verify shape before
// committing parser code.

import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const FILE = resolve(REPO_ROOT, "Golfapalooza History.xlsx");

const wb = XLSX.read(readFileSync(FILE), { type: "buffer", cellDates: true });

console.log("=== Sheet names ===");
console.log(wb.SheetNames);

for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name];
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const rows = range.e.r - range.s.r + 1;
  const cols = range.e.c - range.s.c + 1;
  console.log(`\n=== ${name} (${rows} rows × ${cols} cols) ===`);
  // Print headers (first row) + first 2 data rows
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null });
  if (data.length > 0) {
    console.log("Headers:", data[0]);
    if (data.length > 1) console.log("Row 1:  ", data[1]);
    if (data.length > 2) console.log("Row 2:  ", data[2]);
  }
}

console.log("\n=== AWARDS sheet, all rows ===");
const awardsRows = XLSX.utils.sheet_to_json(wb.Sheets["Awards"], {
  header: 1,
  raw: false,
  defval: null,
});
for (const row of awardsRows) console.log(row);
