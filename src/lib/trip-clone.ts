/**
 * Issue #85 + #128 — trip cloning primitive.
 *
 * Clones a trip's *structural* configuration (contests, options, cost
 * items, payout rows, etc.) into a new `trip_settings` row. The new
 * trip has empty per-year data (no scores, no participants, no
 * winners). The clone primitive is used by:
 *
 *   1. The sandbox simulator ("sync test event from active event") —
 *      target status='test'.
 *   2. Issue #85 ("duplicate event") — target status='draft' or 'active'.
 *
 * The only difference between the two surfaces is the target status +
 * a few date/name overrides; the cloning logic is shared.
 *
 * What gets cloned:
 *   - trip_settings (with overrides for id, status, name, year, dates, sim_date)
 *   - event_days
 *   - contests (with parent_contest_id + buy_in_cost_item_id remapped)
 *   - cost_items (with linked_option_id remapped)
 *   - cost_item_option_choices
 *   - option_groups
 *   - trip_options (with group_id + choices JSONB remapped)
 *   - trip_option_settings (with deadline cleared)
 *   - payout_sheet_events (with contest_id + source_ref + cost_item_id remapped)
 *   - pickem_settings (with contest_id remapped)
 *   - ryder_cup_teams (with contest_id remapped)
 *
 * What stays empty:
 *   - All scores / picks / bids / brackets / winners
 *   - All participants (event_participants, contest_participants)
 *   - All scramble teams, tee time assignments, KGB Cup pairs/foursomes
 *   - User-generated content (chat, gallery, accolade winners)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

export interface CloneOptions {
  /** Target status for the new trip. */
  status: "test" | "active" | "draft" | "archived";
  /** Defaults to "🧪 Test Event" for status='test', else source trip's name. */
  tripName?: string;
  /** Defaults to the current calendar year. */
  tripYear?: number;
  /** Defaults to today's date. Time-gate sensitive consumers rely on this. */
  startDate?: string;
}

export interface CloneResult {
  newTripId: string;
  inserted: Record<string, number>;
  warnings: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripSystemColumns<T extends Record<string, any>>(row: T): T {
  const { id, created_at, updated_at, ...rest } = row;
  void id;
  void created_at;
  void updated_at;
  return rest as unknown as T;
}

export async function cloneTrip(
  client: Client,
  sourceTripId: string,
  options: CloneOptions,
): Promise<CloneResult> {
  const inserted: Record<string, number> = {};
  const warnings: string[] = [];

  // ── 1. trip_settings ───────────────────────────────────────────
  const { data: source, error: srcErr } = await client
    .from("trip_settings")
    .select("*")
    .eq("id", sourceTripId)
    .single();
  if (srcErr || !source) throw new Error(`source trip not found: ${srcErr?.message}`);

  const today = new Date();
  const yyyy = today.getFullYear();
  const startDate =
    options.startDate ??
    `${yyyy}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const newTripPayload = {
    ...stripSystemColumns(source),
    status: options.status,
    trip_name: options.tripName ?? (options.status === "test" ? "🧪 Test Event" : source.trip_name),
    trip_year: options.tripYear ?? yyyy,
    start_date: startDate,
    sim_date: null, // never carry the source's time-sim cursor into the clone
  };

  const { data: created, error: insErr } = await client
    .from("trip_settings")
    .insert(newTripPayload)
    .select("id")
    .single();
  if (insErr || !created) throw new Error(`trip_settings insert: ${insErr?.message}`);
  const newTripId = created.id as string;
  inserted["trip_settings"] = 1;

  // ── 2. event_days ─────────────────────────────────────────────
  const { data: srcDays } = await client
    .from("event_days")
    .select("*")
    .eq("trip_id", sourceTripId);
  if (srcDays && srcDays.length > 0) {
    const rows = srcDays.map((d) => ({
      ...stripSystemColumns(d),
      trip_id: newTripId,
    }));
    const { error } = await client.from("event_days").insert(rows);
    if (error) warnings.push(`event_days: ${error.message}`);
    else inserted["event_days"] = rows.length;
  }

  // ── 3. contests (first pass: no parent_contest_id, no buy_in yet) ──
  const { data: srcContests } = await client
    .from("contests")
    .select("*")
    .eq("trip_id", sourceTripId);

  const contestMap = new Map<string, string>(); // old id → new id
  if (srcContests && srcContests.length > 0) {
    const rows = srcContests.map((c) => {
      const { ...stripped } = stripSystemColumns(c);
      return {
        ...stripped,
        trip_id: newTripId,
        parent_contest_id: null, // filled in second pass
        buy_in_cost_item_id: null, // filled after cost_items copy
      };
    });
    // Insert one at a time so we can capture old→new mapping by index.
    for (let i = 0; i < rows.length; i++) {
      const { data, error } = await client
        .from("contests")
        .insert(rows[i])
        .select("id")
        .single();
      if (error || !data) {
        warnings.push(`contests[${srcContests[i].name}]: ${error?.message}`);
        continue;
      }
      contestMap.set(srcContests[i].id, data.id as string);
    }
    inserted["contests"] = contestMap.size;
  }

  // ── 4. cost_items (without linked_option_id; filled after trip_options) ──
  const { data: srcCostItems } = await client
    .from("cost_items")
    .select("*")
    .eq("trip_id", sourceTripId);

  const costItemMap = new Map<string, string>();
  if (srcCostItems && srcCostItems.length > 0) {
    for (const ci of srcCostItems) {
      const { ...stripped } = stripSystemColumns(ci);
      const { data, error } = await client
        .from("cost_items")
        .insert({
          ...stripped,
          trip_id: newTripId,
          linked_option_id: null, // filled in step 8
        })
        .select("id")
        .single();
      if (error || !data) {
        warnings.push(`cost_items[${ci.name}]: ${error?.message}`);
        continue;
      }
      costItemMap.set(ci.id, data.id as string);
    }
    inserted["cost_items"] = costItemMap.size;
  }

  // ── 5. cost_item_option_choices (FK to cost_items) ────────────
  const { data: srcChoices } = await client
    .from("cost_item_option_choices")
    .select("*")
    .in("cost_item_id", Array.from(costItemMap.keys()).length > 0 ? Array.from(costItemMap.keys()) : ["none"]);
  if (srcChoices && srcChoices.length > 0) {
    const rows = srcChoices
      .map((c) => {
        const newCostItemId = costItemMap.get(c.cost_item_id);
        if (!newCostItemId) return null;
        return { ...stripSystemColumns(c), cost_item_id: newCostItemId };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length > 0) {
      const { error } = await client.from("cost_item_option_choices").insert(rows);
      if (error) warnings.push(`cost_item_option_choices: ${error.message}`);
      else inserted["cost_item_option_choices"] = rows.length;
    }
  }

  // ── 6. option_groups ──────────────────────────────────────────
  const { data: srcGroups } = await client
    .from("option_groups")
    .select("*")
    .eq("trip_id", sourceTripId);

  const groupMap = new Map<string, string>();
  if (srcGroups && srcGroups.length > 0) {
    for (const g of srcGroups) {
      const { data, error } = await client
        .from("option_groups")
        .insert({ ...stripSystemColumns(g), trip_id: newTripId })
        .select("id")
        .single();
      if (error || !data) {
        warnings.push(`option_groups[${g.name}]: ${error?.message}`);
        continue;
      }
      groupMap.set(g.id, data.id as string);
    }
    inserted["option_groups"] = groupMap.size;
  }

  // ── 7. trip_options (with group_id + choices JSONB remap) ────
  const { data: srcOptions } = await client
    .from("trip_options")
    .select("*")
    .eq("trip_id", sourceTripId);

  const optionMap = new Map<string, string>();
  if (srcOptions && srcOptions.length > 0) {
    for (const opt of srcOptions) {
      const newGroupId = groupMap.get(opt.group_id);
      if (!newGroupId) {
        warnings.push(`trip_options[${opt.name}]: parent group not cloned`);
        continue;
      }

      // Remap choices JSONB: each choice may carry contest_id and/or cost_item_ids.
      let remappedChoices = opt.choices;
      if (Array.isArray(opt.choices)) {
        remappedChoices = opt.choices.map((choice: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...choice };
          if (typeof next.contest_id === "string") {
            next.contest_id = contestMap.get(next.contest_id) ?? null;
          }
          if (Array.isArray(next.cost_item_ids)) {
            next.cost_item_ids = (next.cost_item_ids as string[])
              .map((id) => costItemMap.get(id))
              .filter((id): id is string => !!id);
          }
          return next;
        });
      }

      const payload: Record<string, unknown> = {
        ...stripSystemColumns(opt),
        trip_id: newTripId,
        group_id: newGroupId,
        choices: remappedChoices,
      };
      // Remap linked_contest_id if the legacy column is present.
      if (typeof opt.linked_contest_id === "string" && opt.linked_contest_id) {
        payload.linked_contest_id = contestMap.get(opt.linked_contest_id) ?? null;
      }

      const { data, error } = await client
        .from("trip_options")
        .insert(payload)
        .select("id")
        .single();
      if (error || !data) {
        warnings.push(`trip_options[${opt.name}]: ${error?.message}`);
        continue;
      }
      optionMap.set(opt.id, data.id as string);
    }
    inserted["trip_options"] = optionMap.size;
  }

  // ── 8. Update cost_items.linked_option_id ────────────────────
  if (srcCostItems) {
    for (const ci of srcCostItems) {
      const newId = costItemMap.get(ci.id);
      if (!newId || !ci.linked_option_id) continue;
      const newOptionId = optionMap.get(ci.linked_option_id);
      if (!newOptionId) continue;
      await client
        .from("cost_items")
        .update({ linked_option_id: newOptionId })
        .eq("id", newId);
    }
  }

  // ── 9. Update contests.parent_contest_id + buy_in_cost_item_id ──
  if (srcContests) {
    for (const c of srcContests) {
      const newId = contestMap.get(c.id);
      if (!newId) continue;
      const updates: Record<string, unknown> = {};
      if (c.parent_contest_id) {
        const newParentId = contestMap.get(c.parent_contest_id);
        if (newParentId) updates.parent_contest_id = newParentId;
      }
      if (c.buy_in_cost_item_id) {
        const newBuyInId = costItemMap.get(c.buy_in_cost_item_id);
        if (newBuyInId) updates.buy_in_cost_item_id = newBuyInId;
      }
      if (Object.keys(updates).length > 0) {
        await client.from("contests").update(updates).eq("id", newId);
      }
    }
  }

  // ── 10. payout_sheet_events ──────────────────────────────────
  const { data: srcPayouts } = await client
    .from("payout_sheet_events")
    .select("*")
    .eq("trip_id", sourceTripId);

  if (srcPayouts && srcPayouts.length > 0) {
    const rows = srcPayouts.map((p) => {
      const stripped = stripSystemColumns(p);
      const remapped: Record<string, unknown> = { ...stripped, trip_id: newTripId };
      if (p.contest_id) {
        remapped.contest_id = contestMap.get(p.contest_id) ?? null;
      }
      if (p.source_ref) {
        // source_ref points to an option, a contest, or a cost_item depending
        // on participant_source. Try each map; first hit wins.
        remapped.source_ref =
          optionMap.get(p.source_ref) ||
          contestMap.get(p.source_ref) ||
          costItemMap.get(p.source_ref) ||
          null;
      }
      return remapped;
    });
    const { error } = await client.from("payout_sheet_events").insert(rows);
    if (error) warnings.push(`payout_sheet_events: ${error.message}`);
    else inserted["payout_sheet_events"] = rows.length;
  }

  // ── 11. pickem_settings (contest_id remap) ───────────────────
  const { data: srcPickem } = await client
    .from("pickem_settings")
    .select("*")
    .in(
      "contest_id",
      Array.from(contestMap.keys()).length > 0 ? Array.from(contestMap.keys()) : ["none"],
    );
  if (srcPickem && srcPickem.length > 0) {
    const rows = srcPickem
      .map((s) => {
        const newContestId = contestMap.get(s.contest_id);
        if (!newContestId) return null;
        return { ...stripSystemColumns(s), contest_id: newContestId };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length > 0) {
      const { error } = await client.from("pickem_settings").insert(rows);
      if (error) warnings.push(`pickem_settings: ${error.message}`);
      else inserted["pickem_settings"] = rows.length;
    }
  }

  // ── 12. ryder_cup_teams (contest_id remap) ───────────────────
  const { data: srcRcTeams } = await client
    .from("ryder_cup_teams")
    .select("*")
    .in(
      "contest_id",
      Array.from(contestMap.keys()).length > 0 ? Array.from(contestMap.keys()) : ["none"],
    );
  if (srcRcTeams && srcRcTeams.length > 0) {
    const rows = srcRcTeams
      .map((t) => {
        const newContestId = contestMap.get(t.contest_id);
        if (!newContestId) return null;
        return { ...stripSystemColumns(t), contest_id: newContestId };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length > 0) {
      const { error } = await client.from("ryder_cup_teams").insert(rows);
      if (error) warnings.push(`ryder_cup_teams: ${error.message}`);
      else inserted["ryder_cup_teams"] = rows.length;
    }
  }

  // ── 13. trip_option_settings (deadline cleared) ──────────────
  const { data: srcSettings } = await client
    .from("trip_option_settings")
    .select("*")
    .eq("trip_id", sourceTripId)
    .maybeSingle();
  if (srcSettings) {
    const { error } = await client.from("trip_option_settings").insert({
      ...stripSystemColumns(srcSettings),
      trip_id: newTripId,
      selection_deadline: null,
      is_open: false,
    });
    if (error) warnings.push(`trip_option_settings: ${error.message}`);
    else inserted["trip_option_settings"] = 1;
  }

  // ── 14. notebook_categories + notebook_notes ─────────────────
  // Rules / course info / FAQs — pure structure, no per-person data.
  const { data: srcNotebookCats } = await client
    .from("notebook_categories")
    .select("*")
    .eq("trip_id", sourceTripId);

  const notebookCatMap = new Map<string, string>();
  if (srcNotebookCats && srcNotebookCats.length > 0) {
    for (const cat of srcNotebookCats) {
      const { data, error } = await client
        .from("notebook_categories")
        .insert({ ...stripSystemColumns(cat), trip_id: newTripId })
        .select("id")
        .single();
      if (error || !data) {
        warnings.push(`notebook_categories[${cat.name}]: ${error?.message}`);
        continue;
      }
      notebookCatMap.set(cat.id, data.id as string);
    }
    inserted["notebook_categories"] = notebookCatMap.size;
  }

  const { data: srcNotebookNotes } = await client
    .from("notebook_notes")
    .select("*")
    .eq("trip_id", sourceTripId);
  if (srcNotebookNotes && srcNotebookNotes.length > 0) {
    const rows = srcNotebookNotes
      .map((n) => {
        const newCatId = notebookCatMap.get(n.category_id);
        if (!newCatId) return null;
        return {
          ...stripSystemColumns(n),
          trip_id: newTripId,
          category_id: newCatId,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length > 0) {
      const { error } = await client.from("notebook_notes").insert(rows);
      if (error) warnings.push(`notebook_notes: ${error.message}`);
      else inserted["notebook_notes"] = rows.length;
    }
  }

  // ── 15. itinerary_items ──────────────────────────────────────
  const { data: srcItinerary } = await client
    .from("itinerary_items")
    .select("*")
    .eq("trip_id", sourceTripId);
  if (srcItinerary && srcItinerary.length > 0) {
    const rows = srcItinerary.map((i) => ({
      ...stripSystemColumns(i),
      trip_id: newTripId,
    }));
    const { error } = await client.from("itinerary_items").insert(rows);
    if (error) warnings.push(`itinerary_items: ${error.message}`);
    else inserted["itinerary_items"] = rows.length;
  }

  // ── 16. trip_facilities ──────────────────────────────────────
  // Just (trip_id, facility_id) pairs — facility rows themselves are
  // global and shared across trips.
  const { data: srcFacilities } = await client
    .from("trip_facilities")
    .select("*")
    .eq("trip_id", sourceTripId);
  if (srcFacilities && srcFacilities.length > 0) {
    const rows = srcFacilities.map((f) => ({
      ...stripSystemColumns(f),
      trip_id: newTripId,
    }));
    const { error } = await client.from("trip_facilities").insert(rows);
    if (error) warnings.push(`trip_facilities: ${error.message}`);
    else inserted["trip_facilities"] = rows.length;
  }

  // ── 17. action_items ─────────────────────────────────────────
  // Pre-event tasks ("RSVP", "Pay fees", etc.). User completions live
  // in a separate `user_action_completions` table — NOT cloned.
  const { data: srcActions } = await client
    .from("action_items")
    .select("*")
    .eq("trip_id", sourceTripId);
  if (srcActions && srcActions.length > 0) {
    const rows = srcActions.map((a) => ({
      ...stripSystemColumns(a),
      trip_id: newTripId,
    }));
    const { error } = await client.from("action_items").insert(rows);
    if (error) warnings.push(`action_items: ${error.message}`);
    else inserted["action_items"] = rows.length;
  }

  // ── 18. tee_times slots (no player assignments) ─────────────
  // Slot times + starting hole. `scramble_team_id` is cleared because
  // teams don't exist in the new trip yet. Players don't get assigned
  // either — per-person data isn't cloned.
  const { data: srcTeeTimes } = await client
    .from("tee_times")
    .select("*")
    .eq("trip_id", sourceTripId);
  if (srcTeeTimes && srcTeeTimes.length > 0) {
    const rows = srcTeeTimes.map((t) => ({
      ...stripSystemColumns(t),
      trip_id: newTripId,
      scramble_team_id: null,
    }));
    const { error } = await client.from("tee_times").insert(rows);
    if (error) warnings.push(`tee_times: ${error.message}`);
    else inserted["tee_times"] = rows.length;
  }

  // ── 19. contest_hole_tees (per-hole tee assignments per contest) ──
  // Important for scrambles: without these, the scorecards page won't
  // render per-hole columns.
  if (srcContests && srcContests.length > 0) {
    const sourceContestIds = srcContests.map((c) => c.id);
    const { data: srcTees } = await client
      .from("contest_hole_tees")
      .select("*")
      .in("contest_id", sourceContestIds);
    if (srcTees && srcTees.length > 0) {
      const rows = srcTees
        .map((t) => {
          const newContestId = contestMap.get(t.contest_id);
          if (!newContestId) return null;
          return { ...stripSystemColumns(t), contest_id: newContestId };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (rows.length > 0) {
        const { error } = await client.from("contest_hole_tees").insert(rows);
        if (error) warnings.push(`contest_hole_tees: ${error.message}`);
        else inserted["contest_hole_tees"] = rows.length;
      }
    }
  }

  return { newTripId, inserted, warnings };
}
