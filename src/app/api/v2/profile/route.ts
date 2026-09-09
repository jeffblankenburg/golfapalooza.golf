import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { displayNameFrom } from "@/lib/v2/profile";

/**
 * The signed-in user's own v2 profile.
 *   GET   — read every editable field + avatar/phone.
 *   PATCH — update editable fields; display_name is derived (nickname || "First Last").
 * Auth: bearer (native) or cookie (web). A user only ever reads/writes their OWN row.
 */

const PROFILE_COLUMNS =
  "id, display_name, avatar_url, phone, first_name, last_name, nickname, birthdate, zip, occupation, city, state, playing_since, swings, typical_shot, shirt_size, fun_fact, best_shot, show_on_map";

const SWINGS = ["right", "left", "both"];
const SHOTS = ["straight", "slice", "hook", "draw", "fade"];
const SHIRTS = ["S", "M", "L", "XL", "2XL", "3XL", "4XL"];

const str = (v: unknown) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t || null;
};

export async function GET(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  const { data, error } = await admin
    .from("v2_profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
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

  const patch: Record<string, unknown> = {};
  if ("first_name" in body) patch.first_name = str(body.first_name);
  if ("last_name" in body) patch.last_name = str(body.last_name);
  if ("nickname" in body) patch.nickname = str(body.nickname);
  if ("birthdate" in body) {
    const b = str(body.birthdate);
    if (b && !/^\d{4}-\d{2}-\d{2}$/.test(b)) {
      return NextResponse.json({ error: "Birthdate must be YYYY-MM-DD" }, { status: 400 });
    }
    patch.birthdate = b;
  }
  if ("zip" in body) patch.zip = str(body.zip);
  if ("occupation" in body) patch.occupation = str(body.occupation);
  if ("city" in body) patch.city = str(body.city);
  if ("state" in body) patch.state = str(body.state)?.toUpperCase().slice(0, 2) ?? null;
  if ("playing_since" in body) {
    const n = Number(body.playing_since);
    patch.playing_since =
      Number.isInteger(n) && n >= 1900 && n <= new Date().getFullYear() ? n : null;
  }
  if ("swings" in body) {
    const s = str(body.swings);
    patch.swings = s && SWINGS.includes(s) ? s : null;
  }
  if ("typical_shot" in body) {
    const s = str(body.typical_shot);
    patch.typical_shot = s && SHOTS.includes(s) ? s : null;
  }
  if ("shirt_size" in body) {
    const s = str(body.shirt_size)?.toUpperCase() ?? null;
    patch.shirt_size = s && SHIRTS.includes(s) ? s : null;
  }
  if ("fun_fact" in body) patch.fun_fact = str(body.fun_fact);
  if ("best_shot" in body) patch.best_shot = str(body.best_shot);
  if ("show_on_map" in body) patch.show_on_map = !!body.show_on_map;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const admin = v2AdminClient();
  // Recompute the derived display_name when any name part changed.
  if ("first_name" in patch || "last_name" in patch || "nickname" in patch) {
    const { data: cur } = await admin
      .from("v2_profiles")
      .select("first_name, last_name, nickname, display_name")
      .eq("id", userId)
      .maybeSingle();
    const merged = {
      first_name: ("first_name" in patch ? patch.first_name : cur?.first_name) as string | null,
      last_name: ("last_name" in patch ? patch.last_name : cur?.last_name) as string | null,
      nickname: ("nickname" in patch ? patch.nickname : cur?.nickname) as string | null,
    };
    patch.display_name = displayNameFrom(merged, cur?.display_name || "Member");
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from("v2_profiles")
    .update(patch)
    .eq("id", userId)
    .select(PROFILE_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}
