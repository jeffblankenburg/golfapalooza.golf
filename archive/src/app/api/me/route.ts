import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/utils/phone";

/**
 * @swagger
 * /api/me:
 *   get:
 *     summary: Get current user
 *     description: Get the currently authenticated user's profile information
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Current user info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     display_name:
 *                       type: string
 *                     full_name:
 *                       type: string
 *                     is_admin:
 *                       type: boolean
 *       401:
 *         description: Not authenticated
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("Auth error in /api/me:", authError);
      return NextResponse.json({ error: "Authentication error" }, { status: 401 });
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Try to fetch existing profile
    const { data: profile, error } = await supabase
      .from("users")
      .select("id, display_name, full_name, email, phone, is_admin, onboarding_completed")
      .eq("id", user.id)
      .maybeSingle(); // Use maybeSingle instead of single to not error on 0 rows

    if (error) {
      console.error("Error fetching user profile:", error.message, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If profile exists, return it
    if (profile) {
      return NextResponse.json({ user: profile });
    }

    // Profile doesn't exist by ID - check by normalized phone number
    const adminClient = createAdminClient();
    const phone10 = normalizePhone(user.phone);

    console.log("No profile by ID, checking by phone:", phone10);

    // Check if there's an existing profile with this phone number
    if (phone10) {
      const { data: existingByPhone } = await adminClient
        .from("users")
        .select("id, display_name, full_name, email, phone, is_admin, onboarding_completed")
        .eq("phone", phone10)
        .maybeSingle();

      if (existingByPhone) {
        // Found existing profile by phone - update its ID to match auth user
        console.log("Found existing profile by phone, updating ID from", existingByPhone.id, "to", user.id);

        const { data: updatedProfile, error: updateError } = await adminClient
          .from("users")
          .update({ id: user.id })
          .eq("phone", phone10)
          .select("id, display_name, full_name, email, phone, is_admin, onboarding_completed")
          .single();

        if (updateError) {
          console.error("Error updating profile ID:", updateError.message);
          // If update fails, still return the existing profile data
          return NextResponse.json({ user: existingByPhone });
        }

        return NextResponse.json({ user: updatedProfile });
      }
    }

    // No profile found - create new one
    console.log("Creating new profile for user:", user.id);

    const displayName = user.user_metadata?.display_name ||
                        user.email?.split("@")[0] ||
                        (phone10 ? phone10.slice(-4) : null) ||
                        "User";

    const { data: newProfile, error: insertError } = await adminClient
      .from("users")
      .insert({
        id: user.id,
        phone: phone10,
        display_name: displayName,
        full_name: user.user_metadata?.full_name || null,
        email: user.email || null,
        is_admin: false,
        onboarding_completed: false,
      })
      .select("id, display_name, full_name, email, phone, is_admin, onboarding_completed")
      .single();

    if (insertError) {
      console.error("Error creating user profile:", insertError.message, insertError.code);
      return NextResponse.json(
        { error: "Failed to create user profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({ user: newProfile });
  } catch (err) {
    console.error("Unexpected error in /api/me:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/me:
 *   put:
 *     summary: Update current user profile
 *     description: Update the currently authenticated user's display name and full name
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               display_name:
 *                 type: string
 *                 description: Display name (required)
 *               full_name:
 *                 type: string
 *                 description: Full name (optional)
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authenticated
 */
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { display_name, full_name, email, onboarding_completed } = body;

    if (!display_name || typeof display_name !== "string" || !display_name.trim()) {
      return NextResponse.json(
        { error: "Display name is required" },
        { status: 400 }
      );
    }

    // Validate email format if provided
    if (email && typeof email === "string" && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return NextResponse.json(
          { error: "Invalid email format" },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {
      display_name: display_name.trim(),
      full_name: full_name?.trim() || null,
      email: email?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    // Only update onboarding_completed if explicitly provided
    if (typeof onboarding_completed === "boolean") {
      updateData.onboarding_completed = onboarding_completed;
    }

    const { data: updatedProfile, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", user.id)
      .select("id, display_name, full_name, email, phone, is_admin, onboarding_completed")
      .single();

    if (error) {
      console.error("Error updating profile:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ user: updatedProfile });
  } catch (err) {
    console.error("Unexpected error in PUT /api/me:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
