import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { loadParsedWorkbook } from "@/lib/history/load-workbook";
import type { AwardCategory } from "@/lib/history/parse-workbook";

const CATEGORIES: AwardCategory[] = [
  "mvl",
  "roy",
  "melc",
  "bspitw",
  "green_jacket",
  "cornhole_singles",
  "cornhole_doubles",
];

interface CategoryRow {
  category: AwardCategory;
  imported: number;
  expectedFromSummary: number; // sum of Summary sheet column for matched users
  expectedFromAwards: number; // count of award rows in workbook for matched users only
  delta: number; // imported - expectedFromSummary
}

interface UserVerifyRow {
  userId: string;
  workbookName: string;
  displayName: string;
  fullName: string | null;
  imported: Partial<Record<AwardCategory, number>>;
  expected: Partial<Record<AwardCategory, number>>;
  hasMismatch: boolean;
}

/**
 * @swagger
 * /api/admin/history/verify:
 *   get:
 *     summary: Cross-check imported accolades against the workbook Summary sheet (issue #114)
 *     tags: [Admin]
 *     responses:
 *       200: { description: Per-category and per-user diff }
 *       401: { description: Unauthorized }
 */
export async function GET() {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await loadParsedWorkbook();
  const adminClient = createAdminClient();

  const [{ data: users }, { data: imported }] = await Promise.all([
    adminClient.from("users").select("id, workbook_name, display_name, full_name"),
    adminClient
      .from("accolades")
      .select("category, user_id, partner_user_id")
      .neq("category", "custom"),
  ]);

  const usersList = users ?? [];
  const importedList = imported ?? [];

  // Maps for fast lookup
  const userIdByWorkbookName = new Map<string, string>();
  for (const u of usersList) {
    if (u.workbook_name) userIdByWorkbookName.set(u.workbook_name, u.id);
  }
  const matchedUserIds = new Set(userIdByWorkbookName.values());

  // Imported counts per (user_id, category). Doubles cornhole imports as one
  // row per team; both teammates count for the partner-symmetric tally.
  const importedByUserCategory = new Map<string, Partial<Record<AwardCategory, number>>>();
  const bump = (userId: string, cat: AwardCategory) => {
    const m = importedByUserCategory.get(userId) ?? {};
    m[cat] = (m[cat] ?? 0) + 1;
    importedByUserCategory.set(userId, m);
  };
  for (const r of importedList) {
    if (!CATEGORIES.includes(r.category)) continue;
    bump(r.user_id, r.category);
    if (r.partner_user_id) bump(r.partner_user_id, r.category);
  }

  // Per-category totals from imported rows (count rows, not winner+partner).
  const categoryImportedTotals = new Map<AwardCategory, number>();
  for (const r of importedList) {
    if (!CATEGORIES.includes(r.category)) continue;
    categoryImportedTotals.set(r.category, (categoryImportedTotals.get(r.category) ?? 0) + 1);
  }

  // Per-category expectations: filter to matched users only so the comparison
  // is apples-to-apples (unmatched winners are deliberately not imported yet).
  const categoryExpectedFromSummary = new Map<AwardCategory, number>();
  for (const l of parsed.loozers) {
    if (!l.expectedAwardCounts) continue;
    if (!userIdByWorkbookName.has(l.workbookName)) continue;
    for (const cat of CATEGORIES) {
      const v = l.expectedAwardCounts[cat] ?? 0;
      categoryExpectedFromSummary.set(cat, (categoryExpectedFromSummary.get(cat) ?? 0) + v);
    }
  }

  // Per-category expectations from the Awards sheet (every award row, filtered
  // to those whose winner was matched). Doubles partner counted on top.
  const categoryExpectedFromAwards = new Map<AwardCategory, number>();
  for (const a of parsed.awards) {
    const winnerUid = userIdByWorkbookName.get(a.workbookName);
    if (!winnerUid) continue;
    categoryExpectedFromAwards.set(a.category, (categoryExpectedFromAwards.get(a.category) ?? 0) + 1);
  }

  const categoryRows: CategoryRow[] = CATEGORIES.map((cat) => {
    const imported = categoryImportedTotals.get(cat) ?? 0;
    const expSummary = categoryExpectedFromSummary.get(cat) ?? 0;
    const expAwards = categoryExpectedFromAwards.get(cat) ?? 0;
    // Summary counts each cornhole_doubles winner separately; awards table
    // stores one row per team. Normalize so the comparison is consistent:
    // double the doubles imports for the Summary comparison.
    const importedForSummary =
      cat === "cornhole_doubles"
        ? imported * 2 // each row counted for both teammates in Summary
        : imported;
    return {
      category: cat,
      imported,
      expectedFromSummary: expSummary,
      expectedFromAwards: expAwards,
      delta: importedForSummary - expSummary,
    };
  });

  // Per-user breakdown: only matched users.
  const userRows: UserVerifyRow[] = [];
  for (const l of parsed.loozers) {
    const userId = userIdByWorkbookName.get(l.workbookName);
    if (!userId) continue;
    const u = usersList.find((x) => x.id === userId)!;
    const imported = importedByUserCategory.get(userId) ?? {};
    const expected = l.expectedAwardCounts ?? {};
    let hasMismatch = false;
    for (const cat of CATEGORIES) {
      const i = imported[cat] ?? 0;
      const e = expected[cat] ?? 0;
      if (i !== e) {
        hasMismatch = true;
        break;
      }
    }
    userRows.push({
      userId,
      workbookName: l.workbookName,
      displayName: u.display_name,
      fullName: u.full_name,
      imported,
      expected,
      hasMismatch,
    });
  }

  return NextResponse.json({
    matchedUserCount: matchedUserIds.size,
    totalAwardsInWorkbook: parsed.awards.length,
    totalImported: importedList.length,
    categoryRows,
    userRows: userRows.sort((a, b) => {
      if (a.hasMismatch !== b.hasMismatch) return a.hasMismatch ? -1 : 1;
      return (a.fullName ?? a.displayName).localeCompare(b.fullName ?? b.displayName);
    }),
  });
}
