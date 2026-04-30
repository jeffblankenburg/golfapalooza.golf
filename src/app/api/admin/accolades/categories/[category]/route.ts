import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

interface UpdatePayload {
  title?: string;
  short_label?: string;
  icon?: string;
  description?: string | null;
  sort_order?: number;
}

/**
 * @swagger
 * /api/admin/accolades/categories/{category}:
 *   put:
 *     summary: Edit an accolade category's display metadata
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated row }
 *       401: { description: Unauthorized }
 *       404: { description: Category not found }
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ category: string }> },
) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { category } = await params;
  const body = (await request.json()) as UpdatePayload;

  const update: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim();
  if (typeof body.short_label === "string" && body.short_label.trim())
    update.short_label = body.short_label.trim();
  if (typeof body.icon === "string" && body.icon.trim()) update.icon = body.icon.trim();
  if (body.description !== undefined)
    update.description = body.description?.toString().trim() || null;
  if (typeof body.sort_order === "number" && Number.isFinite(body.sort_order))
    update.sort_order = body.sort_order;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("accolade_categories")
    .update(update)
    .eq("category", category)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  return NextResponse.json({ category: data });
}

/**
 * @swagger
 * /api/admin/accolades/categories/{category}:
 *   delete:
 *     summary: Delete an accolade category
 *     description: Fails with 409 if any accolades still reference this category. Reassign or delete winners first.
 *     tags: [Admin]
 *     responses:
 *       200: { description: Deleted }
 *       401: { description: Unauthorized }
 *       404: { description: Category not found }
 *       409: { description: Category has winners assigned }
 */
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

  const { count, error: countErr } = await adminClient
    .from("accolades")
    .select("id", { count: "exact", head: true })
    .eq("category", category);
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${count} winner${count === 1 ? "" : "s"} still hold this award. Remove them first.` },
      { status: 409 },
    );
  }

  const { error, data } = await adminClient
    .from("accolade_categories")
    .delete()
    .eq("category", category)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
