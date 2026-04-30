import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { loadParsedWorkbook } from "@/lib/history/load-workbook";
import type { AwardCategory } from "@/lib/history/parse-workbook";

const SUPPORTED_CATEGORIES: AwardCategory[] = [
  "mvl",
  "roy",
  "melc",
  "bspitw",
  "green_jacket",
  "cornhole_singles",
  "cornhole_doubles",
];

interface ImportRow {
  trip_id: string;
  category: AwardCategory;
  user_id: string;
  partner_user_id: string | null;
  title: string;
}

const TITLE_BY_CATEGORY: Record<AwardCategory, string> = {
  mvl: "Most Valuable Loozer",
  roy: "Rookie of the Year",
  melc: "Most Embarrassing Loozer Cup",
  bspitw: "Best Shot Played In The World",
  green_jacket: "Green Jacket",
  cornhole_singles: "Singles Cornhole Champion",
  cornhole_doubles: "Doubles Cornhole Champions",
};

/**
 * @swagger
 * /api/admin/history/import-accolades:
 *   get:
 *     summary: Preview the historical accolade import (dry run, issue #114)
 *     description: Returns the rows that would be inserted plus rows skipped because their winner isn't matched yet. Does not write.
 *     tags: [Admin]
 *     responses:
 *       200: { description: Import preview }
 *       401: { description: Unauthorized }
 *
 *   post:
 *     summary: Run the historical accolade import (issue #114)
 *     description: Idempotent. Skips awards whose winner workbook_name isn't matched to a user; partner_user_id falls back to NULL when the doubles partner isn't matched. Safe to re-run after matching more users.
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
  console.log(`[import-accolades] start apply=${apply}`);
  const admin = await checkIsAdmin();
  if (!admin) {
    console.log(`[import-accolades] unauthorized`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[import-accolades] loading workbook…`);
  const parsed = await loadParsedWorkbook();
  console.log(`[import-accolades] parsed ${parsed.awards.length} awards`);
  const adminClient = createAdminClient();

  console.log(`[import-accolades] querying DB…`);
  const [tripsRes, usersRes, accoladesRes] = await Promise.all([
    adminClient.from("trip_settings").select("id, trip_year"),
    adminClient.from("users").select("id, workbook_name, display_name, full_name"),
    adminClient
      .from("accolades")
      .select("trip_id, category, user_id, partner_user_id")
      .neq("category", "custom"),
  ]);
  console.log(
    `[import-accolades] trips=${tripsRes.data?.length} users=${usersRes.data?.length} acc=${accoladesRes.data?.length} errs=${[tripsRes.error?.message, usersRes.error?.message, accoladesRes.error?.message].filter(Boolean).join(", ")}`,
  );
  const { data: trips } = tripsRes;
  const { data: users } = usersRes;
  const { data: existingAccolades } = accoladesRes;

  const tripByYear = new Map<number, string>();
  for (const t of trips ?? []) tripByYear.set(t.trip_year, t.id);

  const userByWorkbookName = new Map<string, { id: string; display: string }>();
  for (const u of users ?? []) {
    if (u.workbook_name)
      userByWorkbookName.set(u.workbook_name, {
        id: u.id,
        display: u.full_name ?? u.display_name,
      });
  }

  // Existing-row key set so we know what's already imported (and skip on POST).
  const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
  const existingKeys = new Set<string>();
  for (const row of existingAccolades ?? []) {
    existingKeys.add(
      [row.trip_id, row.category, row.user_id, row.partner_user_id ?? ZERO_UUID].join("|"),
    );
  }

  const toInsert: ImportRow[] = [];
  const skipped: Array<{
    year: number;
    category: string;
    workbookName: string;
    reason: string;
  }> = [];
  const partnerFallbacks: Array<{
    year: number;
    workbookName: string;
    partnerWorkbookName: string;
  }> = [];
  let alreadyPresent = 0;

  for (const award of parsed.awards) {
    if (!SUPPORTED_CATEGORIES.includes(award.category)) continue;

    const tripId = tripByYear.get(award.year);
    if (!tripId) {
      skipped.push({
        year: award.year,
        category: award.category,
        workbookName: award.workbookName,
        reason: "no trip row for that year",
      });
      continue;
    }

    const winner = userByWorkbookName.get(award.workbookName);
    if (!winner) {
      skipped.push({
        year: award.year,
        category: award.category,
        workbookName: award.workbookName,
        reason: "winner workbook_name not matched to a user",
      });
      continue;
    }

    let partnerId: string | null = null;
    if (award.partnerWorkbookName) {
      const partner = userByWorkbookName.get(award.partnerWorkbookName);
      if (partner) {
        partnerId = partner.id;
      } else {
        partnerFallbacks.push({
          year: award.year,
          workbookName: award.workbookName,
          partnerWorkbookName: award.partnerWorkbookName,
        });
      }
    }

    const key = [tripId, award.category, winner.id, partnerId ?? ZERO_UUID].join("|");
    if (existingKeys.has(key)) {
      alreadyPresent += 1;
      continue;
    }

    toInsert.push({
      trip_id: tripId,
      category: award.category,
      user_id: winner.id,
      partner_user_id: partnerId,
      title: TITLE_BY_CATEGORY[award.category],
    });
  }

  let inserted = 0;
  const errors: Array<{ row: ImportRow; error: string }> = [];

  if (apply && toInsert.length > 0) {
    // Insert in chunks of 50 — small enough to avoid request limits and to
    // localize a single bad row's failure scope.
    for (let i = 0; i < toInsert.length; i += 50) {
      const chunk = toInsert.slice(i, i + 50);
      const { data, error } = await adminClient
        .from("accolades")
        .insert(chunk)
        .select("id");
      if (error) {
        // Fall back to per-row inserts so one bad row doesn't lose the chunk.
        for (const row of chunk) {
          const { error: rowErr } = await adminClient.from("accolades").insert(row);
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
    partnerFallbacks,
    errors,
    totalAwardsInWorkbook: parsed.awards.length,
    matchedUserCount: userByWorkbookName.size,
  });
}
