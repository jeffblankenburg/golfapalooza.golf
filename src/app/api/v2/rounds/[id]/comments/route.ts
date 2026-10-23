import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { notifyRoundComment } from "@/lib/v2/rounds/notify";
import { orgNameMode } from "@/lib/v2/orgs";
import { pickName, type NameMode } from "@/lib/v2/profile";
import type { SupabaseClient } from "@supabase/supabase-js";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

const SENDER_SELECT =
  "id, body, image_url, created_at, sender_id, sender:v2_profiles!v2_round_comments_sender_id_fkey(id, display_name, first_name, last_name, avatar_url)";

type SenderProfile = { id: string; display_name: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null };

/** The name-display mode of the group a round was logged under (nickname when personal/none). */
async function roundNameMode(admin: SupabaseClient, roundId: string): Promise<NameMode> {
  const { data: round } = await admin.from("v2_rounds").select("org_id").eq("id", roundId).maybeSingle();
  return round?.org_id ? orgNameMode(admin, round.org_id as string) : "nickname";
}

/** Normalize an embedded sender to one object with its name rendered per the org's mode. */
function shapeSender(sender: unknown, mode: NameMode) {
  const p = one(sender) as SenderProfile | null;
  return p ? { ...p, display_name: pickName(p, mode) } : null;
}

/**
 * GET — all comments on a round, oldest first, with sender profile.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const admin = v2AdminClient();
  const mode = await roundNameMode(admin, id);
  const { data, error } = await admin
    .from("v2_round_comments")
    .select(SENDER_SELECT)
    .eq("round_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const comments = (data || []).map((c) => ({ ...c, sender: shapeSender(c.sender, mode) }));
  return NextResponse.json({ comments });
}

/**
 * POST — add a comment. Body: `{ body }`. Any authed user may comment.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  let payload: { body?: string; imageUrl?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const body = (payload.body || "").trim();
  const imageUrl = (payload.imageUrl || "").trim() || null;
  if (!body && !imageUrl) return NextResponse.json({ error: "Comment is empty" }, { status: 400 });
  if (body.length > 500) return NextResponse.json({ error: "Comment too long" }, { status: 400 });

  const admin = v2AdminClient();
  const { data, error } = await admin
    .from("v2_round_comments")
    .insert({ round_id: id, sender_id: userId, body: body || null, image_url: imageUrl })
    .select(SENDER_SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Roster + @mention notifications (#186). Best-effort.
  await notifyRoundComment(admin, { roundId: id, body: body || null, actorUserId: userId });

  const mode = await roundNameMode(admin, id);
  return NextResponse.json({ comment: { ...data, sender: shapeSender(data.sender, mode) } });
}
