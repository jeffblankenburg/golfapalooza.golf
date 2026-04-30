import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { loadParsedWorkbook } from "@/lib/history/load-workbook";

/**
 * @swagger
 * /api/admin/history/state:
 *   get:
 *     summary: Snapshot of historical-import state (issue #114)
 *     description: Parses the workbook, joins to users, returns everything the matcher UI needs in one round-trip.
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Workbook parse output + match state + candidate users
 *       401:
 *         description: Unauthorized
 */
export async function GET() {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await loadParsedWorkbook();
  const adminClient = createAdminClient();

  const [{ data: users }, { data: trips }, { data: accoladesRows }] = await Promise.all([
    adminClient
      .from("users")
      .select("id, display_name, full_name, avatar_url, workbook_name, is_active, is_system, is_financial_only")
      .order("display_name"),
    adminClient
      .from("trip_settings")
      .select("id, trip_year, trip_name, status")
      .order("trip_year"),
    adminClient
      .from("accolades")
      .select("trip_id, category", { count: "exact" })
      .neq("category", "custom"),
  ]);

  const usersList = users ?? [];
  const tripsList = trips ?? [];

  // Auto-suggest map: workbook name → users.id by squashed-name match.
  // Squashed = lowercase, alphanumerics only. Highest-confidence path is when
  // exactly one user squashes to the workbook name.
  const squash = (s: string | null | undefined) =>
    (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const usersBySquashedFullName = new Map<string, typeof usersList>();
  const usersBySquashedDisplayName = new Map<string, typeof usersList>();
  for (const u of usersList) {
    const fk = squash(u.full_name);
    const dk = squash(u.display_name);
    if (fk) {
      const arr = usersBySquashedFullName.get(fk) ?? [];
      arr.push(u);
      usersBySquashedFullName.set(fk, arr);
    }
    if (dk) {
      const arr = usersBySquashedDisplayName.get(dk) ?? [];
      arr.push(u);
      usersBySquashedDisplayName.set(dk, arr);
    }
  }

  // Existing matches: workbook_name already set on users.
  const matchedByWorkbookName = new Map<string, string>(); // workbookName → user.id
  for (const u of usersList) {
    if (u.workbook_name) matchedByWorkbookName.set(u.workbook_name, u.id);
  }

  const loozers = parsed.loozers.map((l) => {
    const matchedUserId = matchedByWorkbookName.get(l.workbookName) ?? null;
    let suggestedUserId: string | null = null;
    if (!matchedUserId) {
      const key = squash(l.workbookName);
      const fullMatches = usersBySquashedFullName.get(key) ?? [];
      const displayMatches = usersBySquashedDisplayName.get(key) ?? [];
      const candidates = [...new Set([...fullMatches, ...displayMatches])];
      if (candidates.length === 1) suggestedUserId = candidates[0].id;
    }
    return {
      workbookName: l.workbookName,
      firstName: l.firstName,
      lastName: l.lastName,
      sheetsAppearedIn: l.sheetsAppearedIn,
      matchedUserId,
      suggestedUserId,
    };
  });

  // Light per-trip accolade rollup so the import page can show "X awards in
  // year Y" later — same-state response keeps everything in one place.
  const importedAccoladesByTrip = new Map<string, number>();
  for (const row of accoladesRows ?? []) {
    importedAccoladesByTrip.set(row.trip_id, (importedAccoladesByTrip.get(row.trip_id) ?? 0) + 1);
  }

  return NextResponse.json({
    parsed: {
      trips: parsed.trips,
      awardCount: parsed.awards.length,
      warnings: parsed.warnings,
    },
    loozers,
    users: usersList.map((u) => ({
      id: u.id,
      display_name: u.display_name,
      full_name: u.full_name,
      avatar_url: u.avatar_url,
      workbook_name: u.workbook_name,
      is_active: u.is_active,
      is_system: u.is_system,
      is_financial_only: u.is_financial_only,
    })),
    trips: tripsList.map((t) => ({
      id: t.id,
      year: t.trip_year,
      name: t.trip_name,
      status: t.status,
      importedAccoladeCount: importedAccoladesByTrip.get(t.id) ?? 0,
    })),
  });
}
