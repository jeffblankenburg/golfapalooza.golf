import { NextResponse } from "next/server";
import { resolveRoomAccess } from "@/lib/v2/chat";
import { extForImage } from "@/lib/v2/orgs";

const BUCKET = "v2-chat-images";
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/v2/chat/rooms/[roomId]/upload — upload a chat image (multipart `file`)
 * to the public v2-chat-images bucket and return its URL. The client then sends a
 * message with that imageUrl. Room-membership gated.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const a = await resolveRoomAccess(request, roomId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is larger than 10 MB" }, { status: 400 });
  }
  const ext = extForImage(file.type);
  if (!ext) {
    return NextResponse.json({ error: "Use a PNG, JPG, WEBP, or GIF image" }, { status: 400 });
  }

  const path = `${roomId}/${Date.now()}-${a.userId}.${ext}`;
  const { error: upErr } = await a.admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = a.admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: pub.publicUrl });
}
