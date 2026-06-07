import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/simulator";

// GET - List of users eligible for a new DM. Excludes the current user,
// financial-only accounts, and inactive users. Used by the chat drawer's
// compose flow. Mirrors the server fetch on /chat/page.tsx.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const effectiveUserId = await getEffectiveUserId(user.id);

  const { data: users, error } = await supabase
    .from("users")
    .select("id, display_name, avatar_url")
    .eq("is_financial_only", false)
    .eq("is_active", true)
    .neq("id", effectiveUserId)
    .order("display_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    users: users || [],
    current_user_id: effectiveUserId,
  });
}
