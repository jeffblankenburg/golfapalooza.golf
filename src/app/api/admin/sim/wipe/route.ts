/**
 * @swagger
 * /api/admin/sim/wipe:
 *   post:
 *     summary: Issue #128 — wipe data inside the test event
 *     description: |
 *       Clears scores / participants / winners scoped to the test event's
 *       trip_id. Structural rows (contests, options, cost_items) are
 *       untouched. Real Loozer data is in a different trip_id and is
 *       physically unreachable. Admin auth + sim-mode-active required.
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
 *       200: { description: Deletion counts per module }
 *       400: { description: Sim mode not active or invalid body }
 *       401: { description: Unauthorized }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSimTripId } from "@/lib/simulator";
import { SIM_MODULES, type ModuleName } from "@/lib/sim/types";
import { wipeTestEventData } from "@/lib/sim/wipe";

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

  const admin = createAdminClient();
  const scope = body.all
    ? ("all" as const)
    : {
        modules: (body.modules || []).filter((m): m is ModuleName =>
          SIM_MODULES.includes(m as ModuleName),
        ),
      };

  if (scope !== "all" && scope.modules.length === 0) {
    return NextResponse.json({ error: "No modules specified" }, { status: 400 });
  }

  try {
    const results = await wipeTestEventData(admin, simTripId, scope);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
