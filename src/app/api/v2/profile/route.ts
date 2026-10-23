import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { applyProfileUpdate } from "@/lib/v2/profile-write";

/**
 * The signed-in user's own v2 profile.
 *   GET   — read every editable field + avatar/phone.
 *   PATCH — update editable fields; display_name is derived (nickname || "First Last").
 * Auth: bearer (native) or cookie (web). A user only ever reads/writes their OWN row.
 * Field sanitization is shared with the admin member editor via profile-write.ts.
 */

const PROFILE_COLUMNS =
  "id, display_name, avatar_url, phone, first_name, last_name, nickname, birthdate, zip, occupation, city, state, playing_since, swings, typical_shot, shirt_size, fun_fact, best_shot, show_on_map, venmo_username, paypal_username, mailing_address";

export async function GET(request: Request) {
  const { userId, realUserId, simulating } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  const { data, error } = await admin
    .from("v2_profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // `self` = viewing your own real profile (not simulating) — gates auth-critical
  // edits like the phone number, which act on the live session.
  return NextResponse.json({ profile: data, self: !simulating && userId === realUserId });
}

export async function PATCH(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const admin = v2AdminClient();
  const r = await applyProfileUpdate(admin, userId, body, PROFILE_COLUMNS);
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ profile: r.data });
}
