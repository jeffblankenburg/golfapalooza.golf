import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSimUserId } from "@/lib/simulator";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if the real user is admin and simulating someone else
  const { data: realProfile } = await supabase
    .from("users")
    .select("is_admin, permissions")
    .eq("id", user.id)
    .single();

  const realIsAdmin = realProfile?.is_admin ?? false;
  const simUserId = realIsAdmin ? await getSimUserId() : null;

  if (simUserId && realIsAdmin) {
    // Return the simulated user's profile
    const adminClient = createAdminClient();
    const { data: simProfile } = await adminClient
      .from("users")
      .select("is_admin, permissions")
      .eq("id", simUserId)
      .single();

    return NextResponse.json({
      user: {
        id: simUserId,
        is_admin: simProfile?.is_admin ?? false,
        permissions: simProfile?.permissions ?? null,
      },
    });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      is_admin: realProfile?.is_admin ?? false,
      permissions: realProfile?.permissions ?? null,
    },
  });
}
