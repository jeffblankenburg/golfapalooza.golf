import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";

type Params = Promise<{ id: string; contestId: string }>;

const BUCKET = "v2-props";
const MAX_BYTES = 10 * 1024 * 1024;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

/**
 * Upload a Props question image/GIF (multipart `file`). Stores in the public v2-props bucket
 * and returns its public URL for v2_prop_questions.image_url. Org-admin only (props authoring
 * is admin-gated). GIFs picked from GIPHY are hotlinked URLs and never hit this route.
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { data: contest } = await admin.from("v2_contests").select("id, contest_type").eq("id", contestId).eq("org_id", orgId).maybeSingle();
  if (!contest || contest.contest_type !== "props") return NextResponse.json({ error: "Not a Props contest" }, { status: 404 });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch { return NextResponse.json({ error: "Invalid upload" }, { status: 400 }); }
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "Use a PNG, JPG, WEBP, or GIF" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is larger than 10 MB" }, { status: 400 });

  const path = `${orgId}/${contestId}/${Date.now()}-${file.size}.${ext}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ image_url: pub.publicUrl });
}
