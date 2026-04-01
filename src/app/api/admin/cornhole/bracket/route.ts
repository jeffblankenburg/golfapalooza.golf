import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateSingleElimination,
  generateDoubleElimination,
  BracketMatch,
} from "@/lib/bracket/generate";
import { checkIsAdmin } from "@/lib/permissions-server";

// GET — fetch bracket matches with participant display names
export async function GET(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contest_id");

  if (!contestId) {
    return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
  }

  try {
    const adminClient = createAdminClient();

    const { data: matches, error } = await adminClient
      .from("cornhole_bracket_matches")
      .select("*")
      .eq("contest_id", contestId)
      .order("bracket_type")
      .order("round_number")
      .order("match_number");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Gather unique participant IDs to resolve names
    const participantIds = new Set<string>();
    for (const m of matches || []) {
      if (m.slot1_participant_id) participantIds.add(m.slot1_participant_id);
      if (m.slot2_participant_id) participantIds.add(m.slot2_participant_id);
    }

    // Look up display names from users table (for singles) and cornhole_teams (for doubles)
    const nameMap: Record<string, { display_name: string; full_name: string | null }> = {};

    if (participantIds.size > 0) {
      const ids = Array.from(participantIds);

      // Try users first (singles)
      const { data: users } = await adminClient
        .from("users")
        .select("id, display_name, full_name")
        .in("id", ids);

      for (const u of users || []) {
        nameMap[u.id] = { display_name: u.display_name, full_name: u.full_name };
      }

      // Try cornhole_teams (doubles) — team members joined for display
      const { data: teams } = await adminClient
        .from("cornhole_teams")
        .select("id, cornhole_team_members(user_id, user:users(display_name, full_name))")
        .in("id", ids);

      for (const t of teams || []) {
        const members = (t as Record<string, unknown>).cornhole_team_members as Array<{
          user_id: string;
          user: { display_name: string; full_name: string | null } | Array<{ display_name: string; full_name: string | null }> | null;
        }>;
        const names = members.map((m) => {
          const u = Array.isArray(m.user) ? m.user[0] : m.user;
          return u?.display_name || "?";
        });
        nameMap[t.id] = {
          display_name: names.join(" & "),
          full_name: members.map((m) => {
            const u = Array.isArray(m.user) ? m.user[0] : m.user;
            return u?.full_name || u?.display_name || "?";
          }).join(" & "),
        };
      }
    }

    return NextResponse.json({ matches: matches || [], nameMap });
  } catch (error) {
    console.error("Get bracket error:", error);
    return NextResponse.json({ error: "Failed to load bracket" }, { status: 500 });
  }
}

// POST — generate bracket structure
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contest_id, participant_ids } = await request.json();

    if (!contest_id) {
      return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Determine contest type
    const { data: contest, error: contestError } = await adminClient
      .from("contests")
      .select("id, contest_type")
      .eq("id", contest_id)
      .single();

    if (contestError || !contest) {
      return NextResponse.json({ error: "Contest not found" }, { status: 404 });
    }

    // Get participant count
    let ids: string[] = participant_ids || [];
    if (ids.length === 0) {
      if (contest.contest_type === "cornhole_singles") {
        const { data: participants } = await adminClient
          .from("contest_participants")
          .select("user_id")
          .eq("contest_id", contest_id);
        ids = (participants || []).map((p) => p.user_id);
      } else {
        // doubles — use team IDs
        const { data: teams } = await adminClient
          .from("cornhole_teams")
          .select("id")
          .eq("contest_id", contest_id)
          .order("created_at");
        ids = (teams || []).map((t) => t.id);
      }
    }

    // Shuffle for random seeding
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }

    if (ids.length < 2) {
      return NextResponse.json({ error: "Need at least 2 participants" }, { status: 400 });
    }

    // Delete existing bracket
    await adminClient
      .from("cornhole_bracket_matches")
      .delete()
      .eq("contest_id", contest_id);

    // Generate bracket
    const isSingles = contest.contest_type === "cornhole_singles";
    const bracketMatches: BracketMatch[] = isSingles
      ? generateSingleElimination(ids.length, ids)
      : generateDoubleElimination(ids.length, ids);

    // Two-pass insert: first insert without linkages, then update with UUIDs
    const insertRows = bracketMatches.map((m) => ({
      contest_id,
      bracket_type: m.bracket_type,
      round_number: m.round_number,
      match_number: m.match_number,
      slot1_participant_id: m.slot1_participant_id,
      slot2_participant_id: m.slot2_participant_id,
      seed1: m.seed1,
      seed2: m.seed2,
      is_bye: m.is_bye,
    }));

    const { error: insertError } = await adminClient
      .from("cornhole_bracket_matches")
      .insert(insertRows);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Re-fetch inserted rows using the unique constraint fields to build a reliable index→UUID map
    const { data: inserted, error: fetchError } = await adminClient
      .from("cornhole_bracket_matches")
      .select("id, bracket_type, round_number, match_number")
      .eq("contest_id", contest_id);

    if (fetchError || !inserted) {
      return NextResponse.json({ error: fetchError?.message || "Fetch after insert failed" }, { status: 500 });
    }

    // Build lookup: "bracket_type|round|match" → UUID
    const keyToId: Record<string, string> = {};
    for (const row of inserted) {
      keyToId[`${row.bracket_type}|${row.round_number}|${row.match_number}`] = row.id;
    }

    // Map array index → UUID using the match's own bracket_type/round/match fields
    const idMap: string[] = bracketMatches.map(
      (m) => keyToId[`${m.bracket_type}|${m.round_number}|${m.match_number}`]
    );

    // Build updates for linkages
    const updates: PromiseLike<unknown>[] = [];
    for (let i = 0; i < bracketMatches.length; i++) {
      const m = bracketMatches[i];
      const updateFields: Record<string, unknown> = {};
      let hasUpdate = false;

      if (m.next_winner_match_index !== null) {
        updateFields.next_winner_match_id = idMap[m.next_winner_match_index];
        updateFields.next_winner_slot = m.next_winner_slot;
        hasUpdate = true;
      }
      if (m.next_loser_match_index !== null) {
        updateFields.next_loser_match_id = idMap[m.next_loser_match_index];
        updateFields.next_loser_slot = m.next_loser_slot;
        hasUpdate = true;
      }
      if (hasUpdate) {
        updates.push(
          adminClient
            .from("cornhole_bracket_matches")
            .update(updateFields)
            .eq("id", idMap[i])
            .then()
        );
      }
    }

    await Promise.all(updates);

    return NextResponse.json({ success: true, matchCount: inserted.length });
  } catch (error) {
    console.error("Generate bracket error:", error);
    return NextResponse.json({ error: "Failed to generate bracket" }, { status: 500 });
  }
}

// DELETE — clear bracket for a contest
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contest_id");

  if (!contestId) {
    return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
  }

  try {
    const adminClient = createAdminClient();
    // Clear linkages first to avoid FK conflicts
    await adminClient
      .from("cornhole_bracket_matches")
      .update({ next_winner_match_id: null, next_loser_match_id: null })
      .eq("contest_id", contestId);

    const { error } = await adminClient
      .from("cornhole_bracket_matches")
      .delete()
      .eq("contest_id", contestId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete bracket error:", error);
    return NextResponse.json({ error: "Failed to delete bracket" }, { status: 500 });
  }
}
