import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin, extForImage } from "@/lib/v2/orgs";

const BUCKET = "v2-org-logos";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/v2/orgs/[id]/logo — upload/replace an org's logo (multipart `file`).
 * Owner/admin only. Stored in the public v2-org-logos bucket via the service role
 * and written to v2_organizations.logo_url. Auth: bearer (native) or cookie (web).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, id))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is larger than 5 MB" }, { status: 400 });
  }
  const ext = extForImage(file.type);
  if (!ext) {
    return NextResponse.json(
      { error: "Use a PNG, JPG, WEBP, or SVG image" },
      { status: 400 }
    );
  }

  const path = `${id}/logo-${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  const logoUrl = pub.publicUrl;

  const { error: updErr } = await admin
    .from("v2_organizations")
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ logo_url: logoUrl });
}
