import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/bios:
 *   get:
 *     summary: List all Loozer bios with user info
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: List of bios
 *       401:
 *         description: Unauthorized
 */
export async function GET() {
  const admin = await checkPermissionAccess("manage_bios");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();

  // Get all users and their bios
  const [{ data: users }, { data: bios }] = await Promise.all([
    adminClient
      .from("users")
      .select("id, display_name, avatar_url")
      .eq("is_financial_only", false)
      .order("display_name"),
    adminClient
      .from("loozer_bios")
      .select("id, user_id, content, is_visible, updated_at"),
  ]);

  // Admin needs to see every bio row, including hidden ones and rows whose
  // content has been cleared — clearing content shouldn't lose the toggle state.
  const bioMap = new Map((bios || []).map((b) => [b.user_id, b]));

  const result = (users || []).map((u) => ({
    ...u,
    bio: bioMap.get(u.id) || null,
  }));

  return NextResponse.json({ users: result });
}

/**
 * @swagger
 * /api/admin/bios:
 *   post:
 *     summary: Create or update a Loozer bio
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_id:
 *                 type: string
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bio saved
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  const admin = await checkPermissionAccess("manage_bios");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { user_id, content, is_visible } = body;
  if (!user_id) return NextResponse.json({ error: "user_id is required" }, { status: 400 });

  const adminClient = createAdminClient();

  // Look up existing row so we can do partial updates — toggling visibility
  // shouldn't clobber content, and saving content shouldn't flip visibility.
  const { data: existing } = await adminClient
    .from("loozer_bios")
    .select("content, is_visible")
    .eq("user_id", user_id)
    .maybeSingle();

  const nextContent = content !== undefined ? content : existing?.content ?? "";
  const nextVisible = is_visible !== undefined ? is_visible : existing?.is_visible ?? true;

  const { data, error } = await adminClient
    .from("loozer_bios")
    .upsert(
      {
        user_id,
        content: nextContent,
        is_visible: nextVisible,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bio: data });
}

/**
 * @swagger
 * /api/admin/bios:
 *   delete:
 *     summary: Delete a Loozer bio
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bio deleted
 *       401:
 *         description: Unauthorized
 */
export async function DELETE(request: Request) {
  const admin = await checkPermissionAccess("manage_bios");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { user_id } = await request.json();
  if (!user_id) return NextResponse.json({ error: "user_id is required" }, { status: 400 });

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("loozer_bios")
    .delete()
    .eq("user_id", user_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
