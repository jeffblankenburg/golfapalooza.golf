import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";

const BUCKET = "v2-threes-gifs";

/** DELETE a GIF from the library (row + storage object). Admin-only. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; gifId: string }> }) {
  const { id: orgId, gifId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { data: gif } = await admin
    .from("v2_3s_gifs")
    .select("id, path")
    .eq("id", gifId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!gif) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (gif.path) await admin.storage.from(BUCKET).remove([gif.path]).catch(() => {});
  const { error } = await admin.from("v2_3s_gifs").delete().eq("id", gifId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
