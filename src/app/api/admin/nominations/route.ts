import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";
import { sendSms } from "@/lib/sms/twilio";

/**
 * @swagger
 * /api/admin/nominations:
 *   get:
 *     summary: List all rookie nominations
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: List of all nominations
 *       401:
 *         description: Unauthorized
 */
export async function GET() {
  const admin = await checkPermissionAccess("manage_nominations");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const { data: nominations, error } = await adminClient
    .from("rookie_nominations")
    .select(
      "*, nominator:users!nominator_id(display_name, avatar_url), reviewer:users!reviewed_by(display_name)"
    )
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ nominations: nominations || [] });
}

/**
 * @swagger
 * /api/admin/nominations:
 *   patch:
 *     summary: Approve or reject a rookie nomination
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nominationId, action]
 *             properties:
 *               nominationId:
 *                 type: string
 *                 format: uuid
 *               action:
 *                 type: string
 *                 enum: [approve, reject]
 *               rejectionReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Nomination updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
export async function PATCH(request: Request) {
  const admin = await checkPermissionAccess("manage_nominations");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { nominationId, action, rejectionReason, inviteMessage } = await request.json();

    if (!nominationId || !action) {
      return NextResponse.json(
        { error: "nominationId and action are required" },
        { status: 400 }
      );
    }

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Fetch the nomination
    const { data: nomination, error: fetchError } = await adminClient
      .from("rookie_nominations")
      .select("*")
      .eq("id", nominationId)
      .single();

    if (fetchError || !nomination) {
      return NextResponse.json(
        { error: "Nomination not found" },
        { status: 404 }
      );
    }

    if (nomination.status !== "pending") {
      return NextResponse.json(
        { error: "This nomination has already been reviewed" },
        { status: 400 }
      );
    }

    if (action === "reject") {
      const { error: updateError } = await adminClient
        .from("rookie_nominations")
        .update({
          status: "rejected",
          reviewed_by: admin.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectionReason || null,
        })
        .eq("id", nominationId);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, action: "rejected" });
    }

    // === APPROVE FLOW ===

    const phone10 = nomination.phone;

    // 1. Create auth user
    const { data: authUser, error: authError } =
      await adminClient.auth.admin.createUser({
        phone: `+1${phone10}`,
        phone_confirm: true,
      });

    if (authError) {
      if (
        authError.message.includes("already") ||
        authError.message.includes("duplicate")
      ) {
        return NextResponse.json(
          {
            error:
              "A user with this phone number already exists in auth. You may want to reject this nomination.",
          },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    // 2. Create public.users record. The nominator becomes the sponsor —
    //    that's the whole point of the rookie nomination flow.
    const { error: profileError } = await adminClient.from("users").insert({
      id: authUser.user.id,
      phone: phone10,
      display_name: nomination.first_name,
      full_name: `${nomination.first_name} ${nomination.last_name}`,
      sponsor_id: nomination.nominator_id,
    });

    if (profileError) {
      // Rollback: delete auth user
      await adminClient.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json(
        { error: "Failed to create user profile" },
        { status: 500 }
      );
    }

    // 3. Auto-add to "All Loozers" chat room
    const { data: loozersRoom } = await adminClient
      .from("chat_rooms")
      .select("id")
      .eq("type", "group")
      .eq("name", "All Loozers")
      .single();

    if (loozersRoom) {
      await adminClient.from("chat_room_members").insert({
        room_id: loozersRoom.id,
        user_id: authUser.user.id,
      });
    }

    // 4. Update nomination status
    const { error: updateError } = await adminClient
      .from("rookie_nominations")
      .update({
        status: "approved",
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
        created_user_id: authUser.user.id,
        invite_message: inviteMessage || null,
      })
      .eq("id", nominationId);

    if (updateError) {
      console.error("Failed to update nomination status:", updateError);
    }

    // 5. Send the custom invitation SMS via Twilio (skip if no message provided).
    //    The rookie will receive the standard Supabase OTP later, when they
    //    open the app and enter their phone number to log in.
    let smsSent = false;
    let smsError: string | null = null;
    if (inviteMessage && inviteMessage.trim()) {
      const result = await sendSms(`+1${phone10}`, inviteMessage.trim());
      smsSent = result.ok;
      if (!result.ok) {
        smsError = result.error || "Unknown SMS error";
        console.error("Failed to send invitation SMS:", smsError);
      }
    }

    return NextResponse.json({
      success: true,
      action: "approved",
      userId: authUser.user.id,
      smsSent,
      smsError,
      phone: phone10,
      inviteMessage: inviteMessage || null,
    });
  } catch (error) {
    console.error("Review nomination error:", error);
    return NextResponse.json(
      { error: "Failed to process nomination" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/nominations:
 *   delete:
 *     summary: Delete a rejected rookie nomination
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Nomination deleted
 *       400:
 *         description: Nomination is not rejected
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Nomination not found
 */
export async function DELETE(request: Request) {
  const admin = await checkPermissionAccess("manage_nominations");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: nomination, error: fetchError } = await adminClient
    .from("rookie_nominations")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchError || !nomination) {
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

  const { error: deleteError } = await adminClient
    .from("rookie_nominations")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
