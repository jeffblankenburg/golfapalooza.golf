import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";
import { logActivity } from "@/lib/v2/activity";

/**
 * POST /api/v2/gallery/log-upload { orgId, count, imageUrl? } — emit ONE activity
 * feed entry for an upload batch ("Jambone uploaded 68 photos"), rather than one
 * per image. Called by the client after a (possibly bulk) upload finishes.
 */
export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { orgId?: string; count?: number; imageUrl?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const count = Math.max(1, Math.floor(body.count || 1));
  if (!body.orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, body.orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Title is the action only — the feed renders the actor's name itself.
  const title = count > 1 ? `uploaded ${count} photos` : `added a photo`;

  await logActivity(admin, {
    orgId: body.orgId,
    kind: "photo",
    actorId: userId,
    title,
    imageUrl: body.imageUrl ?? null,
    metadata: { count },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
