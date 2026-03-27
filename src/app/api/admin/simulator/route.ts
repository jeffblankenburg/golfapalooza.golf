import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

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

export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const cookieStore = await cookies();

  if (body.simDate) {
    cookieStore.set("sim-date", body.simDate, {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });
  }

  if (body.simUserId) {
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
  const cookieStore = await cookies();

  if (clearDate) {
    cookieStore.delete("sim-date");
  }

  if (clearUser) {
    cookieStore.delete("sim-user-id");
  }

  return NextResponse.json({ success: true });
}
