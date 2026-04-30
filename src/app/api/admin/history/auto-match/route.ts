import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { loadParsedWorkbook } from "@/lib/history/load-workbook";

/**
 * @swagger
 * /api/admin/history/auto-match:
 *   post:
 *     summary: Apply all unambiguous workbook-name → user matches in one pass (issue #114)
 *     description: Only matches when exactly one user squashes to the same key as the workbook name AND no existing match conflicts. Skips entries that need a human decision.
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Counts of matched, skipped, and conflicting entries
 *       401:
 *         description: Unauthorized
 */
export async function POST() {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await loadParsedWorkbook();
  const adminClient = createAdminClient();

  const { data: users } = await adminClient
    .from("users")
    .select("id, display_name, full_name, workbook_name");

  const usersList = users ?? [];

  const squash = (s: string | null | undefined) =>
    (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const usersBySquashed = new Map<string, typeof usersList>();
  for (const u of usersList) {
    for (const candidate of [u.full_name, u.display_name]) {
      const k = squash(candidate);
      if (!k) continue;
      const arr = usersBySquashed.get(k) ?? [];
      if (!arr.find((x) => x.id === u.id)) arr.push(u);
      usersBySquashed.set(k, arr);
    }
  }

  const alreadyMatched = new Set(
    usersList.filter((u) => u.workbook_name).map((u) => u.workbook_name as string),
  );
  const usersWithExistingWorkbookName = new Set(
    usersList.filter((u) => u.workbook_name).map((u) => u.id),
  );

  const updates: { workbookName: string; userId: string }[] = [];
  const skipped: { workbookName: string; reason: string }[] = [];

  for (const l of parsed.loozers) {
    if (alreadyMatched.has(l.workbookName)) {
      skipped.push({ workbookName: l.workbookName, reason: "already matched" });
      continue;
    }
    const candidates = usersBySquashed.get(squash(l.workbookName)) ?? [];
    if (candidates.length === 0) {
      skipped.push({ workbookName: l.workbookName, reason: "no candidate" });
      continue;
    }
    if (candidates.length > 1) {
      skipped.push({ workbookName: l.workbookName, reason: "ambiguous" });
      continue;
    }
    const target = candidates[0];
    if (usersWithExistingWorkbookName.has(target.id)) {
      skipped.push({ workbookName: l.workbookName, reason: "user already has another workbook_name" });
      continue;
    }
    updates.push({ workbookName: l.workbookName, userId: target.id });
    usersWithExistingWorkbookName.add(target.id);
  }

  // Apply updates one by one — the unique index makes a single batch upsert
  // unsafe (any conflict aborts the whole transaction), and the volume is
  // small (under 100 rows even on the first run).
  let applied = 0;
  const errors: { workbookName: string; error: string }[] = [];
  for (const u of updates) {
    const { error } = await adminClient
      .from("users")
      .update({ workbook_name: u.workbookName })
      .eq("id", u.userId);
    if (error) errors.push({ workbookName: u.workbookName, error: error.message });
    else applied += 1;
  }

  return NextResponse.json({
    applied,
    skipped,
    errors,
    totalLoozers: parsed.loozers.length,
  });
}
