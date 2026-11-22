import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";

const BUCKET = "v2-lodging";

/** Delete a property image (row + best-effort storage object). Admins only. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, imageId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const { data: row } = await admin
    .from("v2_lodging_property_images")
    .select("url")
    .eq("id", imageId)
    .eq("org_id", orgId)
    .maybeSingle();

  const { error } = await admin.from("v2_lodging_property_images").delete().eq("id", imageId).eq("org_id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort: strip "<...>/v2-lodging/<path>" from the public URL and remove the object.
  const marker = `/${BUCKET}/`;
  const url = (row as { url?: string } | null)?.url;
  const idx = url?.indexOf(marker) ?? -1;
  if (url && idx >= 0) await admin.storage.from(BUCKET).remove([url.slice(idx + marker.length)]);

  return NextResponse.json({ ok: true });
}
