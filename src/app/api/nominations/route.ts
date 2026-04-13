import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";
import { sendBulkNotifications } from "@/lib/notifications/service";

/**
 * @swagger
 * /api/nominations:
 *   get:
 *     summary: List current user's rookie nominations
 *     tags: [Nominations]
 *     responses:
 *       200:
 *         description: List of nominations
 *       401:
 *         description: Unauthorized
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const adminClient = createAdminClient();

  const { data: nominations, error } = await adminClient
    .from("rookie_nominations")
    .select("*, reviewer:users!reviewed_by(display_name)")
    .eq("nominator_id", effectiveUserId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ nominations: nominations || [] });
}

/**
 * @swagger
 * /api/nominations:
 *   post:
 *     summary: Submit a new rookie nomination
 *     tags: [Nominations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, firstName, lastName]
 *             properties:
 *               phone:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Nomination submitted
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);

  try {
    const { phone, firstName, lastName } = await request.json();

    if (!phone || !firstName || !lastName) {
      return NextResponse.json(
        { error: "Phone, first name, and last name are required" },
        { status: 400 }
      );
    }

    const phone10 = phone.replace(/\D/g, "").slice(-10);
    if (phone10.length !== 10) {
      return NextResponse.json(
        { error: "Invalid phone number" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Check if a user with this phone already exists
    const { data: existingUser } = await adminClient
      .from("users")
      .select("id")
      .eq("phone", phone10)
      .single();

    if (existingUser) {
      return NextResponse.json(
        { error: "A user with this phone number already exists" },
        { status: 400 }
      );
    }

    // Check for pending nomination with this phone
    const { data: existingNomination } = await adminClient
      .from("rookie_nominations")
      .select("id")
      .eq("phone", phone10)
      .eq("status", "pending")
      .single();

    if (existingNomination) {
      return NextResponse.json(
        { error: "A pending nomination for this phone number already exists" },
        { status: 400 }
      );
    }

    // Insert nomination
    const { data: nomination, error } = await adminClient
      .from("rookie_nominations")
      .insert({
        nominator_id: effectiveUserId,
        phone: phone10,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get nominator display name for the notification
    const { data: nominator } = await adminClient
      .from("users")
      .select("display_name")
      .eq("id", effectiveUserId)
      .single();

    // Notify admins and users with manage_loozers permission
    const { data: admins } = await adminClient
      .from("users")
      .select("id, is_admin, permissions")
      .eq("is_active", true);

    if (admins) {
      const notifyIds = admins
        .filter(
          (u) =>
            u.id !== effectiveUserId &&
            (u.is_admin || u.permissions?.manage_loozers === true)
        )
        .map((u) => u.id);

      if (notifyIds.length > 0) {
        sendBulkNotifications(notifyIds, {
          type: "nomination",
          title: "New Rookie Nomination",
          body: `${nominator?.display_name || "Someone"} nominated ${firstName.trim()} ${lastName.trim()}`,
          data: { url: "/admin/nominations" },
        }).catch(console.error);
      }
    }

    return NextResponse.json({ nomination });
  } catch (error) {
    console.error("Create nomination error:", error);
    return NextResponse.json(
      { error: "Failed to create nomination" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/nominations:
 *   delete:
 *     summary: Delete a rejected nomination
 *     tags: [Nominations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nominationId]
 *             properties:
 *               nominationId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Nomination deleted
 *       400:
 *         description: Can only delete rejected nominations
 *       401:
 *         description: Unauthorized
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);

  try {
    const { nominationId } = await request.json();

    if (!nominationId) {
      return NextResponse.json(
        { error: "nominationId is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Verify the nomination belongs to this user and is rejected
    const { data: nomination } = await adminClient
      .from("rookie_nominations")
      .select("id, status, nominator_id")
      .eq("id", nominationId)
      .single();

    if (!nomination || nomination.nominator_id !== effectiveUserId) {
      return NextResponse.json(
        { error: "Nomination not found" },
        { status: 404 }
      );
    }

    if (nomination.status !== "rejected") {
      return NextResponse.json(
        { error: "Only rejected nominations can be deleted" },
        { status: 400 }
      );
    }

    const { error } = await adminClient
      .from("rookie_nominations")
      .delete()
      .eq("id", nominationId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete nomination error:", error);
    return NextResponse.json(
      { error: "Failed to delete nomination" },
      { status: 500 }
    );
  }
}
