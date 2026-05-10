/**
 * Issue #128 — quick-seed scaffolding for the test event.
 *
 * A one-shot helper that turns a bare `status='test'` trip into a
 * fully-configured test event with all the contests / event_days /
 * tee assignments / cost_items the populate generators need.
 *
 * Idempotent: every insert checks for an existing equivalent row first
 * and skips. Re-running on a fully-scaffolded test event is a no-op.
 *
 * What gets created:
 *   - course_id on the test trip copied from the real active trip
 *     (so per-hole pars come from real course data)
 *   - 3 event_days (Thursday / Friday / Saturday on days 2 / 3 / 4)
 *   - 3 scramble contests with 18-hole tee assignments
 *   - 3 scramble_skins contests (one per scramble, parent_contest_id set)
 *   - 12 daily contests (ctp_front, ctp_back, long_drive, long_putt × 3 days)
 *   - 1 "100 Feet!" contest (contest_type='other')
 *   - 1 Pickem, 1 Calcutta, 1 KGB Cup, 1 Cornhole singles, 1 Cornhole doubles
 *   - cost_items + buy_in_cost_item_id linkage so payouts compute non-zero
 *
 * What's NOT scaffolded (admin can add manually if testing those flows):
 *   - option_groups / trip_options
 *   - payout_sheet_events
 *   - notebook_notes
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

export interface ScaffoldResult {
  inserted: Record<string, number>;
  warnings: string[];
}

const DAY_NAMES: Record<number, string> = {
  2: "Thursday",
  3: "Friday",
  4: "Saturday",
};

// Per-contest standard cost-item amounts. Picked to mirror real-event
// proportions without being exact.
const COST_ITEMS = {
  scrambleTeam: { name: "Scramble Team pot", cost: 10, category: "event_pot" },
  scrambleSkins: { name: "Scramble Skins pot", cost: 10, category: "event_pot" },
  ctp: { name: "Closest to Pin pot", cost: 2.5, category: "event_pot" },
  longDrive: { name: "Long Drive pot", cost: 5, category: "event_pot" },
  longPutt: { name: "Long Putt pot", cost: 5, category: "event_pot" },
  hundredFeet: { name: "100 Feet pot", cost: 10, category: "event_pot" },
  pickem: { name: "Pickem entry", cost: 20, category: "event_pot" },
};

export async function scaffoldTestEvent(
  client: Client,
  testTripId: string,
): Promise<ScaffoldResult> {
  const inserted: Record<string, number> = {};
  const warnings: string[] = [];

  // ── 1. Course assignment ──────────────────────────────────────────
  // Copy course_id from the real active trip if the test event has none.
  const { data: testTrip } = await client
    .from("trip_settings")
    .select("course_id")
    .eq("id", testTripId)
    .single();

  let courseId = testTrip?.course_id as string | null;
  if (!courseId) {
    const { data: realTrip } = await client
      .from("trip_settings")
      .select("course_id")
      .eq("status", "active")
      .maybeSingle();
    if (realTrip?.course_id) {
      await client
        .from("trip_settings")
        .update({ course_id: realTrip.course_id })
        .eq("id", testTripId);
      courseId = realTrip.course_id as string;
      inserted["course_assignment"] = 1;
    } else {
      warnings.push("No course found on real active trip; test event has no course (scramble pars will default to par 4).");
    }
  }

  // Pick a default tee for the course — used for every scramble's per-hole
  // tee assignment. Fall back to null if the course has no tees configured.
  let defaultTeeId: string | null = null;
  if (courseId) {
    const { data: tees, error: teesErr } = await client
      .from("course_tees")
      .select("id, tee_name, gender")
      .eq("course_id", courseId)
      .order("tee_name");
    if (teesErr) {
      warnings.push(`course_tees lookup: ${teesErr.message}`);
    }
    // Prefer men's tees; fall back to whatever's there.
    const mens = (tees || []).find((t) => t.gender === "men" || t.gender === "all");
    defaultTeeId = (mens?.id || tees?.[0]?.id || null) as string | null;
    if (!defaultTeeId) {
      warnings.push("Course has no tees configured — scramble contests will be created without per-hole tee assignments.");
    }
  }

  // ── 2. Event days ────────────────────────────────────────────────
  for (const dayNum of [2, 3, 4]) {
    const { data: existing } = await client
      .from("event_days")
      .select("id")
      .eq("trip_id", testTripId)
      .eq("day_number", dayNum)
      .maybeSingle();
    if (existing) continue;
    const { error } = await client.from("event_days").insert({
      trip_id: testTripId,
      day_number: dayNum,
      name: DAY_NAMES[dayNum],
    });
    if (error) warnings.push(`event_days day ${dayNum}: ${error.message}`);
    else inserted["event_days"] = (inserted["event_days"] || 0) + 1;
  }

  // ── 3. Cost items ────────────────────────────────────────────────
  // One cost_item per contest type. Reused as buy_in_cost_item_id on
  // each contest below.
  const costItemIds: Record<keyof typeof COST_ITEMS, string | null> = {
    scrambleTeam: null,
    scrambleSkins: null,
    ctp: null,
    longDrive: null,
    longPutt: null,
    hundredFeet: null,
    pickem: null,
  };

  for (const [key, def] of Object.entries(COST_ITEMS)) {
    const { data: existing } = await client
      .from("cost_items")
      .select("id")
      .eq("trip_id", testTripId)
      .eq("name", def.name)
      .maybeSingle();
    if (existing) {
      costItemIds[key as keyof typeof COST_ITEMS] = existing.id as string;
      continue;
    }
    const { data: created, error } = await client
      .from("cost_items")
      .insert({
        trip_id: testTripId,
        name: def.name,
        cost: def.cost,
        category: def.category,
      })
      .select("id")
      .single();
    if (error || !created) {
      warnings.push(`cost_items ${def.name}: ${error?.message}`);
      continue;
    }
    costItemIds[key as keyof typeof COST_ITEMS] = created.id as string;
    inserted["cost_items"] = (inserted["cost_items"] || 0) + 1;
  }

  // ── 4. Contest insertion helper (idempotent on name+type) ───────
  async function ensureContest(payload: {
    name: string;
    contest_type: string;
    day_number?: number | null;
    parent_contest_id?: string | null;
    buy_in_cost_item_id?: string | null;
    payout_splits?: unknown;
    sort_order?: number;
  }): Promise<string | null> {
    const { data: existing } = await client
      .from("contests")
      .select("id")
      .eq("trip_id", testTripId)
      .eq("name", payload.name)
      .eq("contest_type", payload.contest_type)
      .maybeSingle();
    if (existing) return existing.id as string;

    const { data: created, error } = await client
      .from("contests")
      .insert({
        trip_id: testTripId,
        name: payload.name,
        contest_type: payload.contest_type,
        day_number: payload.day_number ?? null,
        parent_contest_id: payload.parent_contest_id ?? null,
        buy_in_cost_item_id: payload.buy_in_cost_item_id ?? null,
        payout_splits: payload.payout_splits ?? null,
        sort_order: payload.sort_order ?? 0,
      })
      .select("id")
      .single();
    if (error || !created) {
      warnings.push(`contest ${payload.name}: ${error?.message}`);
      return null;
    }
    inserted["contests"] = (inserted["contests"] || 0) + 1;
    return created.id as string;
  }

  async function ensureContestHoleTees(contestId: string): Promise<void> {
    if (!defaultTeeId) return;
    const { data: existing } = await client
      .from("contest_hole_tees")
      .select("hole_number")
      .eq("contest_id", contestId);
    const haveHoles = new Set((existing || []).map((r) => r.hole_number as number));
    const rows: { contest_id: string; hole_number: number; tee_id: string }[] = [];
    for (let h = 1; h <= 18; h++) {
      if (haveHoles.has(h)) continue;
      rows.push({ contest_id: contestId, hole_number: h, tee_id: defaultTeeId });
    }
    if (rows.length === 0) return;
    const { error } = await client.from("contest_hole_tees").insert(rows);
    if (error) warnings.push(`contest_hole_tees: ${error.message}`);
    else inserted["contest_hole_tees"] = (inserted["contest_hole_tees"] || 0) + rows.length;
  }

  // ── 5. Scrambles + Skins child contests ─────────────────────────
  const scramblePayoutSplits = [
    { place: 1, flat_amount: null, percentage: null, remainder: true, label: "1st place" },
    { place: 2, flat_amount: 80, percentage: null, remainder: false, label: "2nd place" },
  ];
  const skinsPayoutSplits = [
    { place: 1, kind: "skins_proportional", remainder: true, label: "Skins" },
  ];

  for (const day of [2, 3, 4]) {
    const dayName = DAY_NAMES[day];
    const scrambleId = await ensureContest({
      name: `${dayName} Scramble`,
      contest_type: "scramble",
      day_number: day,
      buy_in_cost_item_id: costItemIds.scrambleTeam,
      payout_splits: scramblePayoutSplits,
      sort_order: day * 10,
    });
    if (scrambleId) {
      await ensureContestHoleTees(scrambleId);
      await ensureContest({
        name: `${dayName} Skins`,
        contest_type: "scramble_skins",
        day_number: day,
        parent_contest_id: scrambleId,
        buy_in_cost_item_id: costItemIds.scrambleSkins,
        payout_splits: skinsPayoutSplits,
        sort_order: day * 10 + 1,
      });
    }
  }

  // ── 6. Daily contests (CTP / LD / LP × 3 days) ──────────────────
  const dailySplits = [
    { place: 1, flat_amount: null, percentage: null, remainder: true, label: "Winner" },
  ];
  for (const day of [2, 3, 4]) {
    const dayName = DAY_NAMES[day];
    await ensureContest({
      name: `${dayName} CTP — Front`,
      contest_type: "ctp_front",
      day_number: day,
      buy_in_cost_item_id: costItemIds.ctp,
      payout_splits: dailySplits,
      sort_order: 100 + day * 10 + 1,
    });
    await ensureContest({
      name: `${dayName} CTP — Back`,
      contest_type: "ctp_back",
      day_number: day,
      buy_in_cost_item_id: costItemIds.ctp,
      payout_splits: dailySplits,
      sort_order: 100 + day * 10 + 2,
    });
    await ensureContest({
      name: `${dayName} Long Drive`,
      contest_type: "long_drive",
      day_number: day,
      buy_in_cost_item_id: costItemIds.longDrive,
      payout_splits: dailySplits,
      sort_order: 100 + day * 10 + 3,
    });
    await ensureContest({
      name: `${dayName} Long Putt`,
      contest_type: "long_putt",
      day_number: day,
      buy_in_cost_item_id: costItemIds.longPutt,
      payout_splits: dailySplits,
      sort_order: 100 + day * 10 + 4,
    });
  }

  // ── 7. Event-level contests ─────────────────────────────────────
  await ensureContest({
    name: "100 Feet!",
    contest_type: "other",
    buy_in_cost_item_id: costItemIds.hundredFeet,
    payout_splits: [
      { place: 1, flat_amount: null, percentage: null, remainder: true, label: "Closest cumulative" },
    ],
    sort_order: 200,
  });
  await ensureContest({
    name: "Whitey's Pickem",
    contest_type: "pickem",
    buy_in_cost_item_id: costItemIds.pickem,
    payout_splits: [
      { place: 1, percentage: 50, label: "1st" },
      { place: 2, percentage: 30, label: "2nd" },
      { place: 3, percentage: 20, label: "3rd" },
    ],
    sort_order: 210,
  });
  await ensureContest({
    name: "Calcutta",
    contest_type: "calcutta",
    sort_order: 220,
  });
  await ensureContest({
    name: "KGB Cup",
    contest_type: "ryder_cup",
    sort_order: 230,
  });
  await ensureContest({
    name: "Cornhole Singles",
    contest_type: "cornhole_singles",
    sort_order: 240,
  });
  await ensureContest({
    name: "Cornhole Doubles",
    contest_type: "cornhole_doubles",
    sort_order: 250,
  });

  return { inserted, warnings };
}
