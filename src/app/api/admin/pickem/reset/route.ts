import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function checkIsAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) return null;
  return user;
}

// POST - Reset all pick'em data for a contest
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contest_id } = await request.json();

    if (!contest_id) {
      return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Delete in order: picks (FK to games), then games, then payments
    // Picks cascade from games, so deleting games handles picks automatically
    await adminClient
      .from("pickem_games")
      .delete()
      .eq("contest_id", contest_id);

    await adminClient
      .from("pickem_payments")
      .delete()
      .eq("contest_id", contest_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset pickem error:", error);
    return NextResponse.json({ error: "Failed to reset" }, { status: 500 });
  }
}
