import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { loadParsedWorkbook } from "@/lib/history/load-workbook";

interface ImportRow {
  user_id: string;
  trip_id: string;
}

/**
 * @swagger
 * /api/admin/history/import-attendance:
 *   get:
 *     summary: Preview the historical attendance import (issue #114 phase 1b, dry run)
 *     description: Returns rows that would be inserted plus rows skipped because their workbook_name isn't matched yet or the year has no trip row. Does not write.
 *     tags: [Admin]
 *     responses:
 *       200: { description: Import preview }
 *       401: { description: Unauthorized }
 *
 *   post:
 *     summary: Run the historical attendance import (issue #114 phase 1b)
 *     description: Idempotent on (user_id, trip_id). Skips rows whose workbook_name isn't matched. Safe to re-run as more users get matched.
 *     tags: [Admin]
 *     responses:
 *       200: { description: Counts of inserted / skipped / unchanged rows }
 *       401: { description: Unauthorized }
 */
export async function GET() {
  return runImport({ apply: false });
}

export async function POST() {
  return runImport({ apply: true });
}

async function runImport({ apply }: { apply: boolean }) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await loadParsedWorkbook();
  const adminClient = createAdminClient();

  const [tripsRes, usersRes, existingRes] = await Promise.all([
    adminClient.from("trip_settings").select("id, trip_year"),
    adminClient.from("users").select("id, workbook_name"),
    adminClient.from("event_attendance").select("user_id, trip_id"),
  ]);

  const tripByYear = new Map<number, string>();
  for (const t of tripsRes.data ?? []) tripByYear.set(t.trip_year, t.id);

  const userByWorkbookName = new Map<string, string>();
  for (const u of usersRes.data ?? []) {
    if (u.workbook_name) userByWorkbookName.set(u.workbook_name, u.id);
  }

  const existingKeys = new Set<string>();
  for (const row of existingRes.data ?? []) {
    existingKeys.add(`${row.user_id}|${row.trip_id}`);
  }

  const toInsert: ImportRow[] = [];
  const skipped: Array<{ year: number; workbookName: string; reason: string }> = [];
  let alreadyPresent = 0;

  // De-dup intra-batch (same user-year shouldn't appear twice in workbook,
  // but be defensive).
  const seenInBatch = new Set<string>();

  for (const att of parsed.attendance) {
    const tripId = tripByYear.get(att.year);
    if (!tripId) {
      skipped.push({
        year: att.year,
        workbookName: att.workbookName,
        reason: "no trip row for that year",
      });
      continue;
    }
    const userId = userByWorkbookName.get(att.workbookName);
    if (!userId) {
      skipped.push({
        year: att.year,
        workbookName: att.workbookName,
        reason: "workbook_name not matched to a user",
      });
      continue;
    }
    const key = `${userId}|${tripId}`;
    if (existingKeys.has(key)) {
      alreadyPresent += 1;
      continue;
    }
    if (seenInBatch.has(key)) continue;
    seenInBatch.add(key);
    toInsert.push({ user_id: userId, trip_id: tripId });
  }

  let inserted = 0;
  const errors: Array<{ row: ImportRow; error: string }> = [];

  if (apply && toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 100) {
      const chunk = toInsert.slice(i, i + 100);
      const { data, error } = await adminClient
        .from("event_attendance")
        .insert(chunk)
        .select("user_id");
      if (error) {
        for (const row of chunk) {
          const { error: rowErr } = await adminClient.from("event_attendance").insert(row);
          if (rowErr) errors.push({ row, error: rowErr.message });
          else inserted += 1;
        }
      } else {
        inserted += data?.length ?? chunk.length;
      }
    }
  }

  return NextResponse.json({
    apply,
    plannedInserts: toInsert.length,
    inserted,
    alreadyPresent,
    skipped,
    errors,
    totalAttendanceInWorkbook: parsed.attendance.length,
    matchedUserCount: userByWorkbookName.size,
  });
}
