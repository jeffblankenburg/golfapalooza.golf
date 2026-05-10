import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import {
  resolveAllForContest,
  attemptBspitwResolution,
  clearWinnersForContest,
} from "@/lib/winners/resolve";
import {
  materializeScrambleTeamWinners,
  materializeSkinsWinners,
} from "@/lib/winners/materialize";

export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contest_id, action } = await request.json();

    if (!contest_id || !action) {
      return NextResponse.json(
        { error: "contest_id and action are required" },
        { status: 400 }
      );
    }

    const validActions = ["close", "open", "verify", "unverify"];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${validActions.join(", ")}` },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Fetch current contest state
    const { data: contest } = await adminClient
      .from("contests")
      .select("id, trip_id, scoring_closed_at, verified_at")
      .eq("id", contest_id)
      .single();

    if (!contest) {
      return NextResponse.json({ error: "Contest not found" }, { status: 404 });
    }

    if (action === "close") {
      const { error } = await adminClient
        .from("contests")
        .update({
          scoring_closed_at: new Date().toISOString(),
          scoring_closed_by: admin.id,
        })
        .eq("id", contest_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Issue #124: snapshot winners at the moment scoring freezes.
      // Verify will rerun this; that's fine — it's idempotent.
      const { data: closedContest } = await adminClient
        .from("contests")
        .select("contest_type")
        .eq("id", contest_id)
        .single();
      if (closedContest?.contest_type === "scramble") {
        await materializeScrambleTeamWinners(adminClient, contest_id).catch((err) =>
          console.error("close: materializeScrambleTeamWinners failed:", err),
        );
        const { data: skinsChild } = await adminClient
          .from("contests")
          .select("id")
          .eq("parent_contest_id", contest_id)
          .eq("contest_type", "scramble_skins")
          .maybeSingle();
        if (skinsChild?.id) {
          await materializeSkinsWinners(adminClient, skinsChild.id).catch((err) =>
            console.error("close: materializeSkinsWinners failed:", err),
          );
        }
      }
    } else if (action === "open") {
      if (contest.verified_at) {
        return NextResponse.json(
          { error: "Cannot reopen scoring while contest is verified. Unverify first." },
          { status: 400 }
        );
      }

      const { error } = await adminClient
        .from("contests")
        .update({
          scoring_closed_at: null,
          scoring_closed_by: null,
        })
        .eq("id", contest_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (action === "verify") {
      // Auto-close scoring if not already closed
      if (!contest.scoring_closed_at) {
        await adminClient
          .from("contests")
          .update({
            scoring_closed_at: new Date().toISOString(),
            scoring_closed_by: admin.id,
          })
          .eq("id", contest_id);
      }

      const { error } = await adminClient
        .from("contests")
        .update({
          verified_at: new Date().toISOString(),
          verified_by: admin.id,
        })
        .eq("id", contest_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Auto-resolve winners for prizes linked to this contest
      const winnerResults = await resolveAllForContest(adminClient, contest_id, admin.id).catch((err) => {
        console.error("Auto-resolve winners error:", err);
        return [] as { resolved: boolean; error?: string }[];
      });
      for (const r of winnerResults) {
        if (!r.resolved && r.error) {
          console.error("Winner resolution failed:", r.error);
        }
      }

      // Issue #124: also materialize this contest's winners into the
      // unified `contest_winners` shape (Team/place rows + per-user
      // amounts), and trigger the matching child Skins contest if any.
      // This is the "Phase E" write of the Phase C+D+E streamlined ship.
      const { data: thisContest } = await adminClient
        .from("contests")
        .select("contest_type")
        .eq("id", contest_id)
        .single();

      if (thisContest?.contest_type === "scramble") {
        await materializeScrambleTeamWinners(adminClient, contest_id).catch((err) =>
          console.error("materializeScrambleTeamWinners failed:", err),
        );
        const { data: skinsChild } = await adminClient
          .from("contests")
          .select("id")
          .eq("parent_contest_id", contest_id)
          .eq("contest_type", "scramble_skins")
          .maybeSingle();
        if (skinsChild?.id) {
          await materializeSkinsWinners(adminClient, skinsChild.id).catch((err) =>
            console.error("materializeSkinsWinners failed:", err),
          );
        }
      }

      // Check if ALL scramble contests for this trip are now verified
      const { data: allScrambles } = await adminClient
        .from("contests")
        .select("id, verified_at")
        .eq("trip_id", contest.trip_id)
        .eq("contest_type", "scramble");

      const allVerified = allScrambles?.every((c) => c.verified_at != null);

      let bspitwResult = null;
      if (allVerified) {
        bspitwResult = await attemptBspitwResolution(adminClient, contest.trip_id, admin.id).catch((err) => {
          console.error("BSPITW auto-resolve error:", err);
          return null;
        });
      }

      return NextResponse.json({
        success: true,
        winners_resolved: winnerResults.filter((r) => r.resolved).length,
        winner_errors: winnerResults.filter((r) => !r.resolved && r.error).map((r) => r.error),
        bspitw: bspitwResult ? {
          resolved: bspitwResult.resolved,
          tied: bspitwResult.tied || false,
          tiedUserIds: bspitwResult.tiedUserIds,
        } : null,
      });
    } else if (action === "unverify") {
      const { error } = await adminClient
        .from("contests")
        .update({
          verified_at: null,
          verified_by: null,
        })
        .eq("id", contest_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Clear winners for prizes linked to this contest
      await clearWinnersForContest(adminClient, contest_id).catch((err) => {
        console.error("Clear winners on unverify error:", err);
      });

      // If BSPITW was resolved and this breaks the "all verified" condition, clear BSPITW too
      const { data: calcuttaContest } = await adminClient
        .from("contests")
        .select("id")
        .eq("trip_id", contest.trip_id)
        .eq("contest_type", "calcutta")
        .single();

      if (calcuttaContest) {
        const { data: bspitwPrizes } = await adminClient
          .from("calcutta_prizes")
          .select("id")
          .eq("contest_id", calcuttaContest.id)
          .eq("resolution_type", "bspitw");

        if (bspitwPrizes) {
          const { clearWinnersForPrize } = await import("@/lib/winners/resolve");
          for (const prize of bspitwPrizes) {
            await clearWinnersForPrize(adminClient, prize.id).catch(console.error);
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Scoring lifecycle error:", error);
    return NextResponse.json(
      { error: "Failed to update scoring lifecycle" },
      { status: 500 }
    );
  }
}
