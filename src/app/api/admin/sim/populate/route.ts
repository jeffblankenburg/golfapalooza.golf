/**
 * @swagger
 * /api/admin/sim/populate:
 *   post:
 *     summary: Issue #128 — populate the test event with sample data
 *     description: |
 *       Runs one or more data generators against the admin's test event.
 *       Admin auth + sim-mode-active required. Real Loozer data is never
 *       touched — every write is scoped to the test trip_id.
 *     tags: [Admin]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               modules:
 *                 type: array
 *                 items:
 *                   type: string
 *               all:
 *                 type: boolean
 *     responses:
 *       200: { description: Results per module }
 *       400: { description: Sim mode not active or invalid body }
 *       401: { description: Unauthorized }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSimTripId } from "@/lib/simulator";
import { SIM_MODULES, type ModuleName, type GeneratorResult } from "@/lib/sim/types";
import { generateRoster } from "@/lib/sim/generators/roster";
import { generateScramble } from "@/lib/sim/generators/scramble";
import { generateDailyContests } from "@/lib/sim/generators/daily-contests";
import { generateHundredFeet } from "@/lib/sim/generators/hundred-feet";
import { generatePickem } from "@/lib/sim/generators/pickem";
import { generateCalcutta } from "@/lib/sim/generators/calcutta";
import { generateCornhole } from "@/lib/sim/generators/cornhole";
import { generateKgbCup } from "@/lib/sim/generators/kgb-cup";
import { generateTeeTimes } from "@/lib/sim/generators/tee-times";

async function checkAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  return profile?.is_admin ? user : null;
}

export async function POST(request: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const simTripId = await getSimTripId();
  if (!simTripId) {
    return NextResponse.json(
      { error: "Sim mode is not active. Enter sim mode at /admin/simulator first." },
      { status: 400 },
    );
  }

  let body: { modules?: ModuleName[]; all?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const targets: ModuleName[] = body.all
    ? [...SIM_MODULES]
    : (body.modules || []).filter((m): m is ModuleName =>
        SIM_MODULES.includes(m as ModuleName),
      );
  if (targets.length === 0) {
    return NextResponse.json({ error: "No modules specified" }, { status: 400 });
  }

  const admin = createAdminClient();
  const results: GeneratorResult[] = [];

  for (const module of targets) {
    try {
      switch (module) {
        case "roster":
          results.push(await generateRoster(admin, simTripId));
          break;
        case "scramble":
          results.push(await generateScramble(admin, simTripId));
          break;
        case "daily_contests":
          results.push(await generateDailyContests(admin, simTripId));
          break;
        case "hundred_feet":
          results.push(await generateHundredFeet(admin, simTripId));
          break;
        case "pickem":
          results.push(await generatePickem(admin, simTripId));
          break;
        case "calcutta":
          results.push(await generateCalcutta(admin, simTripId));
          break;
        case "cornhole":
          results.push(await generateCornhole(admin, simTripId));
          break;
        case "kgb_cup":
          results.push(await generateKgbCup(admin, simTripId));
          break;
        case "tee_times":
          results.push(await generateTeeTimes(admin, simTripId));
          break;
      }
    } catch (err) {
      results.push({
        module,
        inserted: 0,
        skipped: 0,
        warnings: [(err as Error).message],
      });
    }
  }

  return NextResponse.json({ results });
}
