import { NextResponse } from "next/server";
import { resolveGalleryItem } from "@/lib/v2/gallery";

/**
 * Reactions on a gallery item.
 *   POST   { emoji } — add (idempotent).
 *   DELETE { emoji } — remove the caller's reaction.
 * Auth: bearer/cookie; org-membership gated.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  const a = await resolveGalleryItem(request, itemId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let body: { emoji?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.emoji) return NextResponse.json({ error: "emoji required" }, { status: 400 });

  const { error } = await a.admin
    .from("v2_gallery_reactions")
    .upsert({ item_id: itemId, user_id: a.userId, emoji: body.emoji }, { onConflict: "item_id,user_id,emoji" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  const a = await resolveGalleryItem(request, itemId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let body: { emoji?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.emoji) return NextResponse.json({ error: "emoji required" }, { status: 400 });

  const { error } = await a.admin
    .from("v2_gallery_reactions")
    .delete()
    .eq("item_id", itemId)
    .eq("user_id", a.userId)
    .eq("emoji", body.emoji);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
