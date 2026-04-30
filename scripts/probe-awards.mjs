#!/usr/bin/env node
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const FILE = resolve(REPO_ROOT, "Golfapalooza History.xlsx");

const wb = XLSX.read(readFileSync(FILE), { type: "buffer", cellDates: true });

console.log("=== Awards full dump ===");
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Awards"], {
  header: 1,
  raw: false,
  defval: null,
});
for (let i = 0; i < rows.length; i++) {
  console.log(`[${i}]`, rows[i]);
}

// Also inspect cells around B1 to be sure col 1 is Generation
console.log("\n=== Raw cell B1, B2, B3 ===");
const sheet = wb.Sheets["Awards"];
console.log("A1:", sheet["A1"]);
console.log("B1:", sheet["B1"]);
console.log("B2:", sheet["B2"]);
console.log("B3:", sheet["B3"]);
