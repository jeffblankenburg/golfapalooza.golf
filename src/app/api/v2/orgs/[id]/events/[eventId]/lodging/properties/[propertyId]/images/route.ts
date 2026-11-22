import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin, extForImage } from "@/lib/v2/orgs";
import { IMAGE_SELECT } from "@/lib/v2/lodging";

const BUCKET = "v2-lodging";
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST a floorplan / photo for a property (multipart `file`, optional `caption`).
 * Uploads to the public v2-lodging bucket and records the row. Admins only.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; eventId: string; propertyId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, propertyId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  let file: File | null = null;
  let caption: string | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
    const c = form.get("caption");
    if (typeof c === "string" && c.trim()) caption = c.trim().slice(0, 200);
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is larger than 10 MB" }, { status: 400 });
  const ext = extForImage(file.type);
  if (!ext) return NextResponse.json({ error: "Use a PNG, JPG, WEBP, or GIF image" }, { status: 400 });

  const path = `${eventId}/${propertyId}/${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);

  const { data, error } = await admin
    .from("v2_lodging_property_images")
    .insert({ property_id: propertyId, org_id: orgId, url: pub.publicUrl, caption })
    .select(IMAGE_SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ image: data });
}
