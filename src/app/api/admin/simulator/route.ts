import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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

export async function GET() {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("trip_settings")
    .select("sim_date")
    .eq("status", "active")
    .single();

  const cookieStore = await cookies();
  const simUserId = cookieStore.get("sim-user-id")?.value || null;

  return NextResponse.json({
    simDate: data?.sim_date || null,
    simUserId,
  });
}

export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  if (body.simDate) {
    const supabase = createAdminClient();
    await supabase
      .from("trip_settings")
      .update({ sim_date: body.simDate })
      .eq("status", "active");
  }

  if (body.simUserId) {
    const cookieStore = await cookies();
    cookieStore.set("sim-user-id", body.simUserId, {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const clearDate = body.clearDate ?? true;
  const clearUser = body.clearUser ?? true;

  if (clearDate) {
    const supabase = createAdminClient();
    await supabase
      .from("trip_settings")
      .update({ sim_date: null })
      .eq("status", "active");
  }

  if (clearUser) {
    const cookieStore = await cookies();
    cookieStore.delete("sim-user-id");
  }

  return NextResponse.json({ success: true });
}
