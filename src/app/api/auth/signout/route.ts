import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * @swagger
 * /api/auth/signout:
 *   post:
 *     summary: Sign out
 *     description: Sign out the current user and redirect to home page
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: Redirect to home page
 */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
