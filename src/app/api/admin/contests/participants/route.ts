import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAnyEventAccess, checkContestManageAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/contests/participants:
 *   get:
 *     summary: List participants for a contest
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: contest_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contest participants
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: Request) {
  const admin = await checkAnyEventAccess();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contest_id");

  if (!contestId) {
    return NextResponse.json(
      { error: "contest_id is required" },
      { status: 400 }
    );
  }

  try {
    const adminClient = createAdminClient();

    const { data: participants, error } = await adminClient
      .from("contest_participants")
      .select("user_id, user:users!contest_participants_user_id_fkey(id, display_name, full_name, avatar_url)")
      .eq("contest_id", contestId);

    if (error) {
      console.error("Contest participants GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Compute which participants are auto-enrolled via an option
    // selection (cost_item linkage). Used by the admin accordion to
    // block destructive removal for those users.
    const funded = await fundedByOptionUserIds(adminClient, contestId);

    return NextResponse.json({
      participants,
      funded_by_option_user_ids: [...funded],
    });
  } catch (error) {
    console.error("Contest participants GET uncaught error:", error);
    return NextResponse.json({ error: "Failed to fetch participants" }, { status: 500 });
  }
}

/**
 * For a contest, return the set of user_ids whose current option
 * selection funds the contest's buy_in_cost_item — i.e. the trip ledger
 * already collected from them. Removing these users from the contest
 * would orphan their charge, so the admin UI blocks it (and DELETE
 * enforces the same rule as a safety net).
 */
async function fundedByOptionUserIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  contestId: string,
): Promise<Set<string>> {
  const { data: contest } = await adminClient
    .from("contests")
    .select("buy_in_cost_item_id")
    .eq("id", contestId)
    .single();
  if (!contest?.buy_in_cost_item_id) return new Set();

  const { data: item } = await adminClient
    .from("cost_items")
    .select(
      "linked_option_id, choices:cost_item_option_choices(choice_value)",
    )
    .eq("id", contest.buy_in_cost_item_id)
    .single();
  if (!item?.linked_option_id) return new Set();

  const { data: selections } = await adminClient
    .from("user_option_selections")
    .select("user_id, value")
    .eq("option_id", item.linked_option_id);
  if (!selections || selections.length === 0) return new Set();

  const choices = (item.choices || []) as { choice_value: string }[];
  const choiceSet = new Set(choices.map((c) => c.choice_value));
  const fundsSelection = (value: unknown): boolean => {
    if (choiceSet.size === 0) {
      // No choice filter — any non-zero selection funds the cost_item.
      if (value === true) return true;
      if (typeof value === "string") return value !== "" && value !== "none";
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "number") return value > 0;
      return false;
    }
    if (Array.isArray(value)) return value.some((v) => typeof v === "string" && choiceSet.has(v));
    if (typeof value === "string") return choiceSet.has(value);
    return value === true;
  };

  const out = new Set<string>();
  for (const s of selections as { user_id: string; value: unknown }[]) {
    if (fundsSelection(s.value)) out.add(s.user_id);
  }
  return out;
}

/**
 * @swagger
 * /api/admin/contests/participants:
 *   post:
 *     summary: Add participant to a contest
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Participant added to contest
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  try {
    const { contest_id, user_id } = await request.json();

    if (!contest_id || !user_id) {
      return NextResponse.json(
        { error: "contest_id and user_id are required" },
        { status: 400 }
      );
    }

    const admin = await checkContestManageAccess(contest_id);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from("contest_participants")
      .upsert({ contest_id, user_id }, { onConflict: "contest_id,user_id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Add contest participant error:", error);
    return NextResponse.json(
      { error: "Failed to add contest participant" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/contests/participants:
 *   put:
 *     summary: Bulk set participants for a contest
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Contest participants updated
 *       401:
 *         description: Unauthorized
 */
export async function PUT(request: Request) {
  try {
    const { contest_id, user_ids } = await request.json();

    if (!contest_id || !Array.isArray(user_ids)) {
      return NextResponse.json(
        { error: "contest_id and user_ids array are required" },
        { status: 400 }
      );
    }

    const admin = await checkContestManageAccess(contest_id);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Remove all current participants
    await adminClient
      .from("contest_participants")
      .delete()
      .eq("contest_id", contest_id);

    // Add new participants
    if (user_ids.length > 0) {
      const entries = user_ids.map((uid: string) => ({
        contest_id,
        user_id: uid,
      }));

      const { error } = await adminClient
        .from("contest_participants")
        .insert(entries);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Bulk update contest participants error:", error);
    return NextResponse.json(
      { error: "Failed to update contest participants" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/contests/participants:
 *   delete:
 *     summary: Remove participant from a contest
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Participant removed from contest
 *       401:
 *         description: Unauthorized
 */
export async function DELETE(request: Request) {
  try {
    const { contest_id, user_id } = await request.json();

    if (!contest_id || !user_id) {
      return NextResponse.json(
        { error: "contest_id and user_id are required" },
        { status: 400 }
      );
    }

    const admin = await checkContestManageAccess(contest_id);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Block removal of users who paid via an option selection — the
    // trip ledger already collected from them. Admin must clear the
    // option selection separately to undo that charge.
    const funded = await fundedByOptionUserIds(adminClient, contest_id);
    if (funded.has(user_id)) {
      return NextResponse.json(
        {
          error:
            "This Loozer paid via their option selection. Clear the option in /admin/selections first to refund the charge, then remove them from the contest.",
        },
        { status: 409 },
      );
    }

    // Look up contest_type so we can also clean up type-specific
    // child rows ("they were a mistake" semantics — admin doesn't
    // want stale picks / payments left behind).
    const { data: contest } = await adminClient
      .from("contests")
      .select("contest_type")
      .eq("id", contest_id)
      .single();

    if (contest?.contest_type === "pickem") {
      // Delete the user's picks for any of this contest's games, plus
      // their payment record. The option selection (if any) is left
      // alone — clearing that's a separate admin action via
      // /api/admin/selections so it stays one explicit decision.
      const { data: games } = await adminClient
        .from("pickem_games")
        .select("id")
        .eq("contest_id", contest_id);
      const gameIds = (games || []).map((g) => g.id);
      if (gameIds.length > 0) {
        await adminClient
          .from("pickem_picks")
          .delete()
          .in("game_id", gameIds)
          .eq("user_id", user_id);
      }
      await adminClient
        .from("pickem_payments")
        .delete()
        .eq("contest_id", contest_id)
        .eq("user_id", user_id);
    }

    const { error } = await adminClient
      .from("contest_participants")
      .delete()
      .eq("contest_id", contest_id)
      .eq("user_id", user_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove contest participant error:", error);
    return NextResponse.json(
      { error: "Failed to remove contest participant" },
      { status: 500 }
    );
  }
}
