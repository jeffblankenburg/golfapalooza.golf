#!/usr/bin/env node
// Smoke-test src/lib/history/parse-workbook.ts against the real workbook.
// Run with: npx tsx scripts/test-parse-workbook.mjs

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

const { parseWorkbook } = await import(
  resolve(REPO_ROOT, "src/lib/history/parse-workbook.ts")
);

const buffer = readFileSync(resolve(REPO_ROOT, "Golfapalooza History.xlsx"));
const parsed = parseWorkbook(buffer);

console.log(`\n=== Trips (${parsed.trips.length}) ===`);
for (const t of parsed.trips) console.log(`  ${t.year}  ${t.generation}`);

console.log(`\n=== Awards (${parsed.awards.length}) ===`);
const byCategory = {};
for (const a of parsed.awards) {
  byCategory[a.category] = (byCategory[a.category] ?? 0) + 1;
}
console.log("  By category:", byCategory);
console.log("  First 5 sample:");
for (const a of parsed.awards.slice(0, 5)) {
  console.log(
    `    ${a.year} ${a.category}: ${a.workbookName}${a.partnerWorkbookName ? " + " + a.partnerWorkbookName : ""}`,
  );
}

console.log(`\n=== Unique Loozers (${parsed.loozers.length}) ===`);
console.log("  First 10:");
for (const l of parsed.loozers.slice(0, 10)) {
  console.log(
    `    ${l.workbookName.padEnd(28)} ${l.firstName} ${l.lastName}  (${l.sheetsAppearedIn.join(", ")})`,
  );
}

console.log(`\n=== Warnings (${parsed.warnings.length}) ===`);
for (const w of parsed.warnings) console.log(`  • ${w}`);

console.log(`\n=== Spot-check: Erickaniecki canonicalization ===`);
const eric = parsed.loozers.find((l) => l.workbookName === "EricKaniecki");
const lowerEric = parsed.loozers.find((l) => l.workbookName === "Erickaniecki");
console.log(`  EricKaniecki present: ${!!eric}`);
console.log(`  Erickaniecki absorbed: ${!lowerEric ? "yes" : "no — STILL PRESENT"}`);

console.log(`\n=== Spot-check: 2015 has TWO MELC winners ===`);
const melc2015 = parsed.awards.filter((a) => a.year === 2015 && a.category === "melc");
console.log(`  2015 MELC winners: ${melc2015.length}`);
for (const a of melc2015) console.log(`    ${a.workbookName}`);
