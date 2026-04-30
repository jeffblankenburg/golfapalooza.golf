// Server-only helper: read `Golfapalooza History.xlsx` from the repo root and
// return the parsed structure. Cached per request via React's cache primitive.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cache } from "react";
import { parseWorkbook, type ParsedWorkbook } from "./parse-workbook";

const WORKBOOK_FILENAME = "Golfapalooza History.xlsx";

export const loadParsedWorkbook = cache(async (): Promise<ParsedWorkbook> => {
  const path = join(process.cwd(), WORKBOOK_FILENAME);
  const buffer = await readFile(path);
  return parseWorkbook(buffer);
});
