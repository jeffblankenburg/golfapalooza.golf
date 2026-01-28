import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * @swagger
 * /api/auth/send-otp:
 *   post:
 *     summary: Send SMS verification code
 *     description: Send a one-time password to the user's phone number for authentication. User must exist in the system.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Phone number (10 digits, US only)
 *                 example: "5551234567"
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Phone number is required
 *       403:
 *         description: User not found in system
 *       500:
 *         description: Failed to send verification code
 */
export async function POST(request: Request) {
  try {
    const { phone } = await request.json();

    if (!phone) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Normalize to 10 digits
    const phone10 = phone.replace(/\D/g, "").slice(-10);

    // Check if user exists in public.users table
    const { data: existingUser, error: lookupError } = await adminClient
      .from("users")
      .select("id")
      .eq("phone", phone10)
      .single();

    if (lookupError || !existingUser) {
      return NextResponse.json(
        {
          error:
            "Unable to send verification code. Please contact an administrator.",
        },
        { status: 403 }
      );
    }

    // Send the OTP
    const { error: otpError } = await adminClient.auth.signInWithOtp({
      phone: `+1${phone10}`,
    });

    if (otpError) {
      console.error("OTP error:", otpError);
      return NextResponse.json({ error: otpError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Send OTP error:", error);
    return NextResponse.json(
      { error: "Failed to send verification code" },
      { status: 500 }
    );
  }
}
