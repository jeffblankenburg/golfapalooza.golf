import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

const BUCKET = "accolade-badges";

/**
 * @swagger
 * /api/admin/accolades/categories/{category}/badge:
 *   post:
 *     summary: Upload a badge image for an award (issue #114 follow-up)
 *     description: Multipart form. Replaces any existing badge for this award. Stored in the `accolade-badges` storage bucket; public URL is written to `accolade_categories.icon_url`.
 *     tags: [Admin]
 *     responses:
 *       200: { description: Updated category row }
 *       400: { description: Missing or invalid file }
 *       401: { description: Unauthorized }
 *       404: { description: Category not found }
 *
 *   delete:
 *     summary: Remove the badge image (revert to emoji icon)
 *     tags: [Admin]
 *     responses:
 *       200: { description: Updated category row }
 *       401: { description: Unauthorized }
 *       404: { description: Category not found }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ category: string }> },
) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { category } = await params;
  const adminClient = createAdminClient();

  // Confirm the category exists so we don't orphan a storage object.
  const { data: existing } = await adminClient
    .from("accolade_categories")
    .select("category, icon_url")
    .eq("category", category)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "file must be an image (image/png, image/jpeg, image/svg+xml, etc.)" },
      { status: 400 },
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  // Versioned filename so cache-busting is automatic when the badge is replaced.
  const path = `${category}/${Date.now()}.${ext}`;

  const { data: uploadData, error: uploadErr } = await adminClient.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: "31536000", upsert: false });
  if (uploadErr) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadErr.message}` },
      { status: 500 },
    );
  }

  const { data: urlData } = adminClient.storage.from(BUCKET).getPublicUrl(uploadData.path);

  // Best-effort cleanup of the previous badge so the bucket doesn't accumulate
  // orphans. Only deletes objects we know belong to this category prefix.
  if (existing.icon_url) {
    const m = existing.icon_url.match(new RegExp(`${BUCKET}/(.+)$`));
    if (m && m[1].startsWith(`${category}/`) && m[1] !== uploadData.path) {
      await adminClient.storage.from(BUCKET).remove([m[1]]);
    }
  }

  const { data: updated, error: updErr } = await adminClient
    .from("accolade_categories")
    .update({ icon_url: urlData.publicUrl })
    .eq("category", category)
    .select()
    .maybeSingle();
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  return NextResponse.json({ category: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ category: string }> },
) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { category } = await params;
  const adminClient = createAdminClient();

  const { data: existing } = await adminClient
    .from("accolade_categories")
    .select("category, icon_url")
    .eq("category", category)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  if (existing.icon_url) {
    const m = existing.icon_url.match(new RegExp(`${BUCKET}/(.+)$`));
    if (m && m[1].startsWith(`${category}/`)) {
      await adminClient.storage.from(BUCKET).remove([m[1]]);
    }
  }

  const { data: updated, error } = await adminClient
    .from("accolade_categories")
    .update({ icon_url: null })
    .eq("category", category)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ category: updated });
}
