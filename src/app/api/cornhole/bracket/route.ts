import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET — public bracket data for a contest. Read-only; no auth required so the
 * spectator page can render the same view. All DB access already goes through
 * the admin client below.
 */
export async function GET(request: Request) {
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

    const nameMap: Record<
      string,
      { display_name: string; full_name: string | null }
    > = {};

    if (participantIds.size > 0) {
      const ids = Array.from(participantIds);

      // Users (singles)
      const { data: users } = await adminClient
        .from("users")
        .select("id, display_name, full_name")
        .in("id", ids);

      for (const u of users || []) {
        nameMap[u.id] = {
          display_name: u.display_name,
          full_name: u.full_name,
        };
      }

      // Teams (doubles)
      const { data: teams } = await adminClient
        .from("cornhole_teams")
        .select(
          "id, cornhole_team_members(user_id, user:users(display_name, full_name))"
        )
        .in("id", ids);

      for (const t of teams || []) {
        const members = (t as Record<string, unknown>)
          .cornhole_team_members as Array<{
          user_id: string;
          user:
            | { display_name: string; full_name: string | null }
            | Array<{ display_name: string; full_name: string | null }>
            | null;
        }>;
        const names = members.map((m) => {
          const u = Array.isArray(m.user) ? m.user[0] : m.user;
          return u?.display_name || "?";
        });
        nameMap[t.id] = {
          display_name: names.join(" & "),
          full_name: members
            .map((m) => {
              const u = Array.isArray(m.user) ? m.user[0] : m.user;
              return u?.full_name || u?.display_name || "?";
            })
            .join(" & "),
        };
      }
    }

    return NextResponse.json({ matches: matches || [], nameMap });
  } catch (error) {
    console.error("Public bracket fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load bracket" },
      { status: 500 }
    );
  }
}
