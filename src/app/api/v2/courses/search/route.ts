import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";

/**
 * GET /api/v2/courses/search?q=<text> — lightweight typeahead over the universal
 * v2 course library (name / club / city), for the "log a round" course picker.
 * Returns just the fields the picker needs. Any signed-in user may search.
 */
export async function GET(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  const admin = v2AdminClient();

  let query = admin
    .from("v2_courses")
    .select("id, name, club_name, city, state")
    .order("name", { ascending: true })
    .limit(8);

  if (q) {
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    query = query.or(`name.ilike.${like},club_name.ilike.${like},city.ilike.${like}`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ courses: data || [] });
}
