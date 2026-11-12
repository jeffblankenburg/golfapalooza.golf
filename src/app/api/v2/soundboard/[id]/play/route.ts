import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";

/**
 * POST /api/v2/soundboard/[id]/play — log a play. Delegates to the
 * v2_log_sound_play RPC (one round-trip: history row + group counter + per-user
 * counter), which self-gates to org members via auth.uid(). Returns the new
 * group play_count so the UI can reconcile its optimistic bump. Best-effort:
 * a failed log never blocks playback, so callers fire-and-forget.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, supabase } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Use the caller's RLS client so auth.uid() inside the SECURITY DEFINER RPC is
  // the real user; fall back to admin only if the request carried no client.
  const client = supabase ?? v2AdminClient();
  const { data, error } = await client.rpc("v2_log_sound_play", { p_sound_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ play_count: data as number });
}
