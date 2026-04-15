import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve course hole data for a tee, handling composition tees transparently.
 *
 * For regular tees: queries course_holes directly.
 * For composition tees: looks up the source tee for each hole via
 * composition_tee_mappings, then fetches the actual hole data from
 * each source tee's course_holes.
 *
 * Returns the same shape as a direct course_holes query.
 */
export async function resolveHolesForTee(
  supabase: SupabaseClient,
  teeId: string,
  select = "hole_number, par, handicap_index, yards, tee_latitude, tee_longitude, green_latitude, green_longitude, drive_latitude, drive_longitude, overhead_image_url, green_image_url, green_front_latitude, green_front_longitude, green_back_latitude, green_back_longitude"
) {
  // Check if this is a composition tee
  const { data: mappings } = await supabase
    .from("composition_tee_mappings")
    .select("hole_number, source_tee_id")
    .eq("tee_id", teeId)
    .order("hole_number");

  if (!mappings || mappings.length === 0) {
    // Regular tee — query directly
    const { data, error } = await supabase
      .from("course_holes")
      .select(select)
      .eq("tee_id", teeId)
      .order("hole_number");

    return { data: data || [], error };
  }

  // Composition tee — fetch holes from source tees
  const sourceTeeIds = [...new Set(mappings.map((m) => m.source_tee_id))];

  // Fetch all holes for all source tees in one query
  // Ensure tee_id and hole_number are always included for lookup
  const compositionSelect = select === "*" ? "*" :
    (select.includes("tee_id") ? select : `tee_id, ${select}`);
  const { data: allSourceHoles, error } = await supabase
    .from("course_holes")
    .select(compositionSelect)
    .in("tee_id", sourceTeeIds)
    .order("hole_number");

  if (error) return { data: [], error };

  // Build lookup: source_tee_id -> hole_number -> hole data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lookup = new Map<string, Map<number, any>>();
  for (const h of allSourceHoles || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const holeData = h as any;
    const tId = holeData.tee_id as string;
    if (!lookup.has(tId)) lookup.set(tId, new Map());
    lookup.get(tId)!.set(holeData.hole_number as number, holeData);
  }

  // Resolve each hole from its mapped source
  const resolved = mappings.map((m) => {
    const sourceHoles = lookup.get(m.source_tee_id);
    const holeData = sourceHoles?.get(m.hole_number);
    if (holeData) {
      // Return the hole data but strip the tee_id (it's from the source, not the composition)
      const { ...rest } = holeData;
      return rest;
    }
    // Fallback: empty hole
    return { hole_number: m.hole_number, par: 4, handicap_index: 0, yards: null };
  });

  return { data: resolved, error: null };
}

/**
 * Check if a tee is a composition tee.
 */
export async function isCompositionTee(
  supabase: SupabaseClient,
  teeId: string
): Promise<boolean> {
  const { count } = await supabase
    .from("composition_tee_mappings")
    .select("id", { count: "exact", head: true })
    .eq("tee_id", teeId);

  return (count || 0) > 0;
}
