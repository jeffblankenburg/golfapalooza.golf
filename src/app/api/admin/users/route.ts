import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin, checkAnyPermissionAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: List all users
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: List of users
 *       401:
 *         description: Unauthorized
 */
export async function GET() {
  const admin = await checkAnyPermissionAccess();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { data: users, error } = await adminClient
    .from("users")
    .select("*, player_handicaps(handicap_index)")
    .order("display_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Normalize: extract handicap_index from joined table
  const normalizedUsers = (users || []).map((u) => {
    const ph = Array.isArray(u.player_handicaps) ? u.player_handicaps[0] : u.player_handicaps;
    const { player_handicaps: _, ...rest } = u;
    return { ...rest, handicap_index: ph?.handicap_index ?? null };
  });

  return NextResponse.json({ users: normalizedUsers });
}

/**
 * @swagger
 * /api/admin/users:
 *   post:
 *     summary: Create a new user
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: User created
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { phone, displayName, fullName, handicapIndex, eightBagAverage, avgScrambleScore, birthday } = await request.json();

    if (!displayName) {
      return NextResponse.json(
        { error: "Display name is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const isFinancialOnly = !phone || phone.trim() === "";

    if (isFinancialOnly) {
      // Financial-only user: create a disabled auth placeholder (no login possible)
      const placeholderEmail = `financial-${crypto.randomUUID()}@nologin.local`;
      const { data: authUser, error: authError } =
        await adminClient.auth.admin.createUser({
          email: placeholderEmail,
          email_confirm: true,
          user_metadata: { is_financial_only: true },
        });

      if (authError) {
        console.error("Financial-only auth creation error:", authError);
        return NextResponse.json({ error: authError.message }, { status: 500 });
      }

      const { error: profileError } = await adminClient.from("users").insert({
        id: authUser.user.id,
        phone: null,
        display_name: displayName,
        full_name: fullName || null,
        is_financial_only: true,
        eight_bag_average: eightBagAverage ? parseFloat(eightBagAverage) : null,
        avg_scramble_score: avgScrambleScore ? parseFloat(avgScrambleScore) : null,
        birthday: birthday || null,
      });

      if (profileError) {
        console.error("Financial-only user creation error:", profileError);
        await adminClient.auth.admin.deleteUser(authUser.user.id);
        return NextResponse.json(
          { error: profileError.message || "Failed to create user profile" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, userId: authUser.user.id });
    }

    // Regular user: requires valid phone + auth account
    const phone10 = phone.replace(/\D/g, "").slice(-10);
    if (phone10.length !== 10) {
      return NextResponse.json(
        { error: "Invalid phone number" },
        { status: 400 }
      );
    }

    // Create auth user
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
          { error: "A user with this phone number already exists" },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Create public.users record
    const { error: profileError } = await adminClient.from("users").insert({
      id: authUser.user.id,
      phone: phone10,
      display_name: displayName,
      full_name: fullName || null,
      is_financial_only: false,
      eight_bag_average: eightBagAverage ? parseFloat(eightBagAverage) : null,
      avg_scramble_score: avgScrambleScore ? parseFloat(avgScrambleScore) : null,
      birthday: birthday || null,
    });

    if (profileError) {
      await adminClient.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json(
        { error: "Failed to create user profile" },
        { status: 500 }
      );
    }

    // Save handicap index if provided
    if (handicapIndex && handicapIndex !== "") {
      await adminClient
        .from("player_handicaps")
        .upsert(
          { user_id: authUser.user.id, handicap_index: parseFloat(handicapIndex) },
          { onConflict: "user_id" }
        );
    }

    // Auto-add to All Loozers group chat
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

    return NextResponse.json({ success: true, userId: authUser.user.id });
  } catch (error) {
    console.error("Create user error:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/users:
 *   put:
 *     summary: Update a user
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: User updated
 *       401:
 *         description: Unauthorized
 */
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { userId, displayName, fullName, phone, isAdmin, permissions, handicapIndex, eightBagAverage, avgScrambleScore, birthday } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { data: currentUser } = await adminClient
      .from("users")
      .select("phone, is_financial_only")
      .eq("id", userId)
      .single();

    const phone10 = phone ? phone.replace(/\D/g, "").slice(-10) : null;
    const phoneChanged = phone10 && currentUser?.phone !== phone10;
    const wasFinancialOnly = currentUser?.is_financial_only === true;
    const becomingRegular = wasFinancialOnly && phone10;

    if (phoneChanged) {
      const { error: authError } = await adminClient.auth.admin.updateUserById(
        userId,
        { phone: `+1${phone10}` }
      );

      if (authError) {
        return NextResponse.json(
          { error: authError.message || "Failed to update phone number" },
          { status: 500 }
        );
      }
    }

    const updates: Record<string, unknown> = {};
    if (displayName !== undefined) updates.display_name = displayName;
    if (fullName !== undefined) updates.full_name = fullName;
    if (phoneChanged && phone10) updates.phone = phone10;
    if (becomingRegular) updates.is_financial_only = false;
    if (isAdmin !== undefined) updates.is_admin = isAdmin;
    if (permissions !== undefined) updates.permissions = permissions;
    if (eightBagAverage !== undefined) updates.eight_bag_average = eightBagAverage === null || eightBagAverage === "" ? null : parseFloat(eightBagAverage);
    if (avgScrambleScore !== undefined) updates.avg_scramble_score = avgScrambleScore === null || avgScrambleScore === "" ? null : parseFloat(avgScrambleScore);
    if (birthday !== undefined) updates.birthday = birthday === null || birthday === "" ? null : birthday;

    if (Object.keys(updates).length > 0) {
      const { error } = await adminClient
        .from("users")
        .update(updates)
        .eq("id", userId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // Upsert handicap if provided
    if (handicapIndex !== undefined) {
      if (handicapIndex === null || handicapIndex === "") {
        // Remove handicap
        await adminClient
          .from("player_handicaps")
          .delete()
          .eq("user_id", userId);
      } else {
        const { error: hcError } = await adminClient
          .from("player_handicaps")
          .upsert(
            { user_id: userId, handicap_index: parseFloat(handicapIndex) },
            { onConflict: "user_id" }
          );
        if (hcError) {
          return NextResponse.json({ error: hcError.message }, { status: 500 });
        }
      }
    }

    // If transitioning from financial-only to regular, add to All Loozers chat
    if (becomingRegular) {
      const { data: loozersRoom } = await adminClient
        .from("chat_rooms")
        .select("id")
        .eq("type", "group")
        .eq("name", "All Loozers")
        .single();

      if (loozersRoom) {
        await adminClient.from("chat_room_members").upsert(
          { room_id: loozersRoom.id, user_id: userId },
          { onConflict: "room_id,user_id" }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/users:
 *   patch:
 *     summary: Toggle admin status
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Admin status updated
 *       401:
 *         description: Unauthorized
 */
export async function PATCH(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { userId, isAdmin } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("users")
      .update({ is_admin: isAdmin })
      .eq("id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Toggle admin error:", error);
    return NextResponse.json(
      { error: "Failed to update admin status" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/users:
 *   delete:
 *     summary: Delete a user
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: User deleted
 *       401:
 *         description: Unauthorized
 */
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    if (userId === admin.id) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient.auth.admin.deleteUser(userId);

    if (error) {
      return NextResponse.json(
        { error: "Failed to delete user" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
