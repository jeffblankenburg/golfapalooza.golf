import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/accolades/categories:
 *   get:
 *     summary: List accolade categories with editable display metadata + accolade counts
 *     tags: [Admin]
 *     responses:
 *       200: { description: Categories ordered by sort_order }
 *       401: { description: Unauthorized }
 *
 *   post:
 *     summary: Create a new accolade category
 *     description: Slug is normalized to lowercase + underscores. Slug must be unique.
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               category: { type: string, description: "Slug; auto-derived from title if omitted" }
 *               title: { type: string }
 *               short_label: { type: string }
 *               icon: { type: string, description: "Emoji" }
 *               description: { type: string }
 *               sort_order: { type: integer }
 *     responses:
 *       200: { description: Created category }
 *       400: { description: Invalid payload }
 *       401: { description: Unauthorized }
 *       409: { description: Slug already exists }
 */
export async function GET() {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminClient = createAdminClient();
  const [{ data: categories, error: catErr }, { data: counts }] = await Promise.all([
    adminClient
      .from("accolade_categories")
      .select("category, title, short_label, icon, icon_url, description, sort_order, updated_at")
      .order("sort_order"),
    adminClient.from("accolades").select("category"),
  ]);
  if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });

  const countsByCategory = new Map<string, number>();
  for (const r of counts ?? [])
    countsByCategory.set(r.category, (countsByCategory.get(r.category) ?? 0) + 1);

  return NextResponse.json({
    categories: (categories ?? []).map((c) => ({
      ...c,
      accolade_count: countsByCategory.get(c.category) ?? 0,
    })),
  });
}

function normalizeSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Partial<{
    category: string;
    title: string;
    short_label: string;
    icon: string;
    description: string | null;
    sort_order: number;
  }>;

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const slug = normalizeSlug(body.category?.trim() || title);
  if (!slug) {
    return NextResponse.json(
      { error: "category slug must contain at least one alphanumeric character" },
      { status: 400 },
    );
  }

  const row = {
    category: slug,
    title,
    short_label: body.short_label?.trim() || title.slice(0, 12),
    icon: body.icon?.trim() || "🏵️",
    description: body.description?.toString().trim() || null,
    sort_order: typeof body.sort_order === "number" ? body.sort_order : 50,
  };

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("accolade_categories")
    .insert(row)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Category "${slug}" already exists` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ category: { ...data, accolade_count: 0 } });
}
