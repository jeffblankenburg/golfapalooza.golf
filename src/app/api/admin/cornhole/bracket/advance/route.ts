import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { computeChampionId } from "@/lib/bracket/champion";
import { resolveAllForContest, clearWinnersForContest } from "@/lib/winners/resolve";

interface BracketMatchRow {
  id: string;
  slot1_participant_id: string | null;
  slot2_participant_id: string | null;
  winner_participant_id: string | null;
  is_bye: boolean;
  next_winner_match_id: string | null;
  next_winner_slot: number | null;
  next_loser_match_id: string | null;
  next_loser_slot: number | null;
  series_best_of?: number | null;
  slot1_wins?: number | null;
  slot2_wins?: number | null;
  bracket_type?: string;
  round_number?: number;
  contest_id?: string;
}

/**
 * Recursively un-advance a match and all downstream matches that depended on it.
 * Depth-limited to 20 as a safety valve.
 */
async function cascadeUnadvance(
  adminClient: ReturnType<typeof createAdminClient>,
  match: BracketMatchRow,
  depth: number = 0
): Promise<void> {
  if (depth > 20) return;

  // If the next winner match already has a winner, cascade into it first
  if (match.next_winner_match_id) {
    const { data: nextWinnerMatch } = await adminClient
      .from("cornhole_bracket_matches")
      .select("*")
      .eq("id", match.next_winner_match_id)
      .single();

    if (nextWinnerMatch?.winner_participant_id) {
      await cascadeUnadvance(adminClient, nextWinnerMatch, depth + 1);
    }
  }

  // If the next loser match already has a winner, cascade into it first
  if (match.next_loser_match_id) {
    const { data: nextLoserMatch } = await adminClient
      .from("cornhole_bracket_matches")
      .select("*")
      .eq("id", match.next_loser_match_id)
      .single();

    if (nextLoserMatch?.winner_participant_id) {
      await cascadeUnadvance(adminClient, nextLoserMatch, depth + 1);
    }
  }

  // Clear winner on this match (and reset series wins — no-op for non-series)
  await adminClient
    .from("cornhole_bracket_matches")
    .update({
      winner_participant_id: null,
      slot1_wins: 0,
      slot2_wins: 0,
    })
    .eq("id", match.id);

  // Remove winner from the next winner match slot. If the downstream match is
  // a series match, also reset its wins since an original participant is gone.
  if (match.next_winner_match_id && match.next_winner_slot) {
    const slotField =
      match.next_winner_slot === 1
        ? "slot1_participant_id"
        : "slot2_participant_id";
    await adminClient
      .from("cornhole_bracket_matches")
      .update({ [slotField]: null, slot1_wins: 0, slot2_wins: 0 })
      .eq("id", match.next_winner_match_id);
  }

  // Remove loser from the next loser match slot
  if (match.next_loser_match_id && match.next_loser_slot) {
    const slotField =
      match.next_loser_slot === 1
        ? "slot1_participant_id"
        : "slot2_participant_id";
    await adminClient
      .from("cornhole_bracket_matches")
      .update({ [slotField]: null, slot1_wins: 0, slot2_wins: 0 })
      .eq("id", match.next_loser_match_id);
  }

  // Championship → reset special case: next_loser_match_id exists but next_loser_slot is null
  // Clear both slots of the reset match
  if (match.next_loser_match_id && !match.next_loser_slot) {
    const { data: resetMatch } = await adminClient
      .from("cornhole_bracket_matches")
      .select("*")
      .eq("id", match.next_loser_match_id)
      .single();

    if (resetMatch) {
      if (resetMatch.winner_participant_id) {
        await cascadeUnadvance(adminClient, resetMatch, depth + 1);
      }
      await adminClient
        .from("cornhole_bracket_matches")
        .update({
          slot1_participant_id: null,
          slot2_participant_id: null,
          winner_participant_id: null,
          slot1_wins: 0,
          slot2_wins: 0,
        })
        .eq("id", match.next_loser_match_id);
    }
  }
}

/**
 * PUT — advance or un-advance a match winner (toggle behavior)
 */
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { match_id, participant_id, action } = body as {
      match_id?: string;
      participant_id?: string;
      action?: "reset";
    };

    if (!match_id) {
      return NextResponse.json(
        { error: "match_id is required" },
        { status: 400 }
      );
    }

    if (action !== "reset" && !participant_id) {
      return NextResponse.json(
        { error: "participant_id is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Fetch the match
    const { data: match, error: matchError } = await adminClient
      .from("cornhole_bracket_matches")
      .select("*")
      .eq("id", match_id)
      .single();

    if (matchError || !match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Check if contest is locked (winners already resolved)
    const { data: contestState } = await adminClient
      .from("contests")
      .select("winners_locked_at")
      .eq("id", match.contest_id)
      .single();

    if (contestState?.winners_locked_at) {
      return NextResponse.json(
        { error: "This bracket is locked because winners have been resolved. Unlock it from the Calcutta Winners section first." },
        { status: 400 }
      );
    }

    // Reset action: clear series progress and cascade un-advance
    if (action === "reset") {
      if (!match.series_best_of) {
        return NextResponse.json(
          { error: "Reset is only valid for a series match" },
          { status: 400 }
        );
      }
      await cascadeUnadvance(adminClient, match);
      await adminClient
        .from("cornhole_bracket_matches")
        .update({ slot1_wins: 0, slot2_wins: 0 })
        .eq("id", match_id);

      const { data: allMatches } = await adminClient
        .from("cornhole_bracket_matches")
        .select("bracket_type, round_number, match_number, slot1_participant_id, slot2_participant_id, winner_participant_id")
        .eq("contest_id", match.contest_id);

      if (allMatches && !computeChampionId(allMatches)) {
        await clearWinnersForContest(adminClient, match.contest_id).catch(console.error);
      }

      return NextResponse.json({ success: true, action: "reset" });
    }

    // Validation
    if (match.is_bye) {
      return NextResponse.json(
        { error: "Cannot advance a bye match" },
        { status: 400 }
      );
    }

    if (!match.slot1_participant_id || !match.slot2_participant_id) {
      return NextResponse.json(
        { error: "Both slots must be filled before advancing" },
        { status: 400 }
      );
    }

    if (
      participant_id !== match.slot1_participant_id &&
      participant_id !== match.slot2_participant_id
    ) {
      return NextResponse.json(
        { error: "Participant is not in this match" },
        { status: 400 }
      );
    }

    // Series-match branch: each click records a game win; advance fires only
    // when one slot reaches the win threshold.
    if (match.series_best_of) {
      const winsNeeded = Math.ceil(match.series_best_of / 2);

      // Click on winner of completed series → un-advance + reset wins.
      if (match.winner_participant_id === participant_id) {
        await cascadeUnadvance(adminClient, match);
        await adminClient
          .from("cornhole_bracket_matches")
          .update({ slot1_wins: 0, slot2_wins: 0 })
          .eq("id", match_id);

        const { data: allMatches } = await adminClient
          .from("cornhole_bracket_matches")
          .select("bracket_type, round_number, match_number, slot1_participant_id, slot2_participant_id, winner_participant_id")
          .eq("contest_id", match.contest_id);

        if (allMatches && !computeChampionId(allMatches)) {
          await clearWinnersForContest(adminClient, match.contest_id).catch(console.error);
        }

        return NextResponse.json({ success: true, action: "unadvanced" });
      }

      // Clicks on the non-winning slot in a completed series are rejected —
      // the admin must first reset by clicking the winner.
      if (match.winner_participant_id) {
        return NextResponse.json(
          { error: "Series is already decided. Tap the current winner to reset." },
          { status: 400 }
        );
      }

      const isSlot1 = participant_id === match.slot1_participant_id;
      const newSlot1Wins = (match.slot1_wins ?? 0) + (isSlot1 ? 1 : 0);
      const newSlot2Wins = (match.slot2_wins ?? 0) + (isSlot1 ? 0 : 1);
      const seriesWon =
        newSlot1Wins >= winsNeeded || newSlot2Wins >= winsNeeded;

      const updateFields: Record<string, unknown> = {
        slot1_wins: newSlot1Wins,
        slot2_wins: newSlot2Wins,
      };
      if (seriesWon) updateFields.winner_participant_id = participant_id;

      await adminClient
        .from("cornhole_bracket_matches")
        .update(updateFields)
        .eq("id", match_id);

      if (seriesWon) {
        const winnerId = participant_id!;
        const loserId = isSlot1
          ? match.slot2_participant_id
          : match.slot1_participant_id;

        if (match.next_winner_match_id && match.next_winner_slot) {
          const slotField =
            match.next_winner_slot === 1
              ? "slot1_participant_id"
              : "slot2_participant_id";
          await adminClient
            .from("cornhole_bracket_matches")
            .update({ [slotField]: winnerId })
            .eq("id", match.next_winner_match_id);
        }

        if (match.next_loser_match_id && match.next_loser_slot) {
          const slotField =
            match.next_loser_slot === 1
              ? "slot1_participant_id"
              : "slot2_participant_id";
          await adminClient
            .from("cornhole_bracket_matches")
            .update({ [slotField]: loserId })
            .eq("id", match.next_loser_match_id);
        }

        const { data: allMatches } = await adminClient
          .from("cornhole_bracket_matches")
          .select("bracket_type, round_number, match_number, slot1_participant_id, slot2_participant_id, winner_participant_id")
          .eq("contest_id", match.contest_id);

        if (allMatches && computeChampionId(allMatches)) {
          await resolveAllForContest(adminClient, match.contest_id, admin.id).catch(
            (err) => console.error("Auto-resolve cornhole winners error:", err)
          );
        }

        return NextResponse.json({ success: true, action: "advanced" });
      }

      return NextResponse.json({
        success: true,
        action: "game_recorded",
        slot1_wins: newSlot1Wins,
        slot2_wins: newSlot2Wins,
      });
    }

    // Toggle: if already the winner, un-advance
    if (match.winner_participant_id === participant_id) {
      await cascadeUnadvance(adminClient, match);

      // Check if un-advancing removed a champion — clear winners if so
      const { data: allMatches } = await adminClient
        .from("cornhole_bracket_matches")
        .select("bracket_type, round_number, match_number, slot1_participant_id, slot2_participant_id, winner_participant_id")
        .eq("contest_id", match.contest_id);

      if (allMatches && !computeChampionId(allMatches)) {
        await clearWinnersForContest(adminClient, match.contest_id).catch(console.error);
      }

      return NextResponse.json({ success: true, action: "unadvanced" });
    }

    // If a different winner was set, un-advance first (cascade)
    if (match.winner_participant_id) {
      await cascadeUnadvance(adminClient, match);
    }

    // Advance: set winner
    const winnerId = participant_id;
    const loserId =
      match.slot1_participant_id === winnerId
        ? match.slot2_participant_id
        : match.slot1_participant_id;

    await adminClient
      .from("cornhole_bracket_matches")
      .update({ winner_participant_id: winnerId })
      .eq("id", match_id);

    // Place winner in next winner match
    if (match.next_winner_match_id && match.next_winner_slot) {
      const slotField =
        match.next_winner_slot === 1
          ? "slot1_participant_id"
          : "slot2_participant_id";
      await adminClient
        .from("cornhole_bracket_matches")
        .update({ [slotField]: winnerId })
        .eq("id", match.next_winner_match_id);
    }

    // Place loser in next loser match (double elimination)
    if (match.next_loser_match_id && match.next_loser_slot) {
      const slotField =
        match.next_loser_slot === 1
          ? "slot1_participant_id"
          : "slot2_participant_id";
      await adminClient
        .from("cornhole_bracket_matches")
        .update({ [slotField]: loserId })
        .eq("id", match.next_loser_match_id);
    }

    // Championship special case: next_loser_match_id with null slot means championship→reset link
    // If LB champion (slot2) wins, populate reset match with both players
    // If WB champion (slot1) wins, tournament is over — do nothing extra
    if (
      match.bracket_type === "championship" &&
      match.round_number === 1 &&
      match.next_loser_match_id &&
      !match.next_loser_slot
    ) {
      if (winnerId === match.slot2_participant_id) {
        // LB champion won — send both to the reset match
        await adminClient
          .from("cornhole_bracket_matches")
          .update({
            slot1_participant_id: match.slot1_participant_id,
            slot2_participant_id: match.slot2_participant_id,
          })
          .eq("id", match.next_loser_match_id);
      }
    }

    // Check if a champion was just crowned — auto-resolve linked prizes
    const { data: allMatches } = await adminClient
      .from("cornhole_bracket_matches")
      .select("bracket_type, round_number, match_number, slot1_participant_id, slot2_participant_id, winner_participant_id")
      .eq("contest_id", match.contest_id);

    if (allMatches && computeChampionId(allMatches)) {
      await resolveAllForContest(adminClient, match.contest_id, admin.id).catch((err) => {
        console.error("Auto-resolve cornhole winners error:", err);
      });
    }

    return NextResponse.json({ success: true, action: "advanced" });
  } catch (error) {
    console.error("Advance bracket error:", error);
    return NextResponse.json(
      { error: "Failed to advance match" },
      { status: 500 }
    );
  }
}
