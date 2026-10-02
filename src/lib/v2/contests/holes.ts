import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveHolesForTee } from "@/lib/v2/courses/composition-tees";

export interface ContestHole {
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number | null;
  tee_color: string | null;
  tee_name: string | null;
}

/**
 * Per-hole par + stroke index (+ yardage and tee color/name for pickers) for a
 * contest (#209 scoring). Honors a contest-only custom tee mix (config.hole_tees:
 * hole → source tee), else falls back to the contest's tee via resolveHolesForTee
 * (which handles standard + composition tees). Returns holes sorted by number, or
 * [] if the contest has no course/tee yet.
 */
export async function resolveContestHoles(
  admin: SupabaseClient,
  contest: { tee_id: string | null; config: Record<string, unknown> | null },
): Promise<ContestHole[]> {
  const holeTees = (contest.config?.hole_tees as Record<string, string> | undefined) || null;

  if (holeTees && Object.keys(holeTees).length) {
    const teeIds = [...new Set(Object.values(holeTees))];
    const [{ data: holeData }, { data: teeData }] = await Promise.all([
      admin.from("v2_course_holes").select("tee_id, hole_number, par, handicap_index, yards").in("tee_id", teeIds),
      admin.from("v2_course_tees").select("id, tee_color, tee_name").in("id", teeIds),
    ]);
    const teeInfo = new Map((teeData || []).map((t) => [t.id as string, { color: (t.tee_color as string) ?? null, name: (t.tee_name as string) ?? null }]));
    const byKey = new Map<string, { par: number; handicap_index: number; yards: number | null }>();
    for (const h of holeData || []) byKey.set(`${h.tee_id}|${h.hole_number}`, { par: h.par as number, handicap_index: h.handicap_index as number, yards: (h.yards as number) ?? null });
    const holes: ContestHole[] = [];
    for (const [k, teeId] of Object.entries(holeTees)) {
      const n = Number(k);
      const h = byKey.get(`${teeId}|${n}`);
      const ti = teeInfo.get(teeId);
      if (h) holes.push({ hole_number: n, par: h.par, handicap_index: h.handicap_index, yards: h.yards, tee_color: ti?.color ?? null, tee_name: ti?.name ?? null });
    }
    return holes.sort((a, b) => a.hole_number - b.hole_number);
  }

  if (contest.tee_id) {
    const [{ data }, { data: teeRow }] = await Promise.all([
      resolveHolesForTee(admin, contest.tee_id, "hole_number, par, handicap_index, yards"),
      admin.from("v2_course_tees").select("tee_color, tee_name").eq("id", contest.tee_id).maybeSingle(),
    ]);
    const baseColor = (teeRow?.tee_color as string) ?? null;
    const baseName = (teeRow?.tee_name as string) ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data as any[]) || [])
      .map((h) => ({
        hole_number: h.hole_number as number,
        par: h.par as number,
        handicap_index: h.handicap_index as number,
        yards: (h.yards as number) ?? null,
        // Composition tees carry a per-hole source color; regular tees use the one tee.
        tee_color: (h.source_tee_color as string) ?? baseColor,
        tee_name: h.source_tee_color ? null : baseName,
      }))
      .sort((a, b) => a.hole_number - b.hole_number);
  }

  return [];
}
