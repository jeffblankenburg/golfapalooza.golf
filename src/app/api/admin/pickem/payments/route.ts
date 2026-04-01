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

// PUT - Toggle payment status
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contest_id, user_id, paid } = await request.json();

    if (!contest_id || !user_id) {
      return NextResponse.json({ error: "contest_id and user_id are required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("pickem_payments")
      .upsert(
        {
          contest_id,
          user_id,
          paid: !!paid,
          paid_at: paid ? new Date().toISOString() : null,
        },
        { onConflict: "contest_id,user_id" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update pickem payment error:", error);
    return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
  }
}
