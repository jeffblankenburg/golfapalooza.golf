import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/**
 * GET — all comments on a round, oldest first, with sender profile.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const admin = v2AdminClient();
  const { data, error } = await admin
    .from("v2_round_comments")
    .select("id, body, image_url, created_at, sender_id, sender:v2_profiles!v2_round_comments_sender_id_fkey(id, display_name, avatar_url)")
    .eq("round_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const comments = (data || []).map((c) => ({ ...c, sender: one(c.sender) }));
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
    .select("id, body, image_url, created_at, sender_id, sender:v2_profiles!v2_round_comments_sender_id_fkey(id, display_name, avatar_url)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ comment: { ...data, sender: one(data.sender) } });
}
