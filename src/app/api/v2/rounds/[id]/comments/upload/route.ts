import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { extForImage } from "@/lib/v2/orgs";

const BUCKET = "v2-chat-images";
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST — upload a round-comment image (multipart `file`) to the shared public
 * image bucket and return its URL. The client then posts a comment with imageUrl.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: roundId } = await params;

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is larger than 10 MB" }, { status: 400 });
  const ext = extForImage(file.type);
  if (!ext) return NextResponse.json({ error: "Use a PNG, JPG, WEBP, or GIF image" }, { status: 400 });

  const admin = v2AdminClient();
  const path = `round-comments/${roundId}/${Date.now()}-${userId}.${ext}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: pub.publicUrl });
}
