import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, getEffectiveTripId } from "@/lib/simulator";
import { checkPermissionAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/best-lines:
 *   get:
 *     summary: List Best Line submissions for the active trip
 *     tags: [BestLine]
 *     responses:
 *       200:
 *         description: Submissions list (own only, or all if admin)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No active trip
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const adminClient = createAdminClient();

  // Get active trip
  const { data: trip } = await adminClient
    .from("trip_settings")
    .select("id")
    .eq("id", (await getEffectiveTripId())!)
    .maybeSingle();

  if (!trip) {
    return NextResponse.json({ error: "No active trip" }, { status: 404 });
  }

  // Check if user has admin access for best line
  const hasAdmin = await checkPermissionAccess("manage_best_line");

  if (hasAdmin) {
    // Return all submissions with submitter names
    const { data, error } = await adminClient
      .from("best_line_submissions")
      .select("id, text, created_at, submitter_id, submitter:users(display_name, avatar_url)")
      .eq("trip_id", trip.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ submissions: data || [], isAdmin: true, currentUserId: effectiveUserId });
  }

  // Regular user: own submissions only
  const { data, error } = await adminClient
    .from("best_line_submissions")
    .select("id, text, created_at, submitter_id")
    .eq("trip_id", trip.id)
    .eq("submitter_id", effectiveUserId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ submissions: data || [], isAdmin: false, currentUserId: effectiveUserId });
}

/**
 * @swagger
 * /api/best-lines:
 *   post:
 *     summary: Submit a Best Line nomination
 *     tags: [BestLine]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *     responses:
 *       201:
 *         description: Submission created
 *       400:
 *         description: Missing or empty text
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);

  const body = await request.json();
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Get active trip
  const { data: trip } = await adminClient
    .from("trip_settings")
    .select("id")
    .eq("id", (await getEffectiveTripId())!)
    .maybeSingle();

  if (!trip) {
    return NextResponse.json({ error: "No active trip" }, { status: 404 });
  }

  const { data, error } = await adminClient
    .from("best_line_submissions")
    .insert({
      trip_id: trip.id,
      submitter_id: effectiveUserId,
      text,
    })
    .select("id, text, created_at, submitter_id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ submission: data }, { status: 201 });
}

/**
 * @swagger
 * /api/best-lines:
 *   delete:
 *     summary: Delete a Best Line submission
 *     tags: [BestLine]
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not allowed to delete this submission
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Fetch the submission to check ownership
  const { data: submission } = await adminClient
    .from("best_line_submissions")
    .select("submitter_id")
    .eq("id", id)
    .maybeSingle();

  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Check authorization: own submission or admin
  const isOwn = submission.submitter_id === effectiveUserId;
  if (!isOwn) {
    const hasAdmin = await checkPermissionAccess("manage_best_line");
    if (!hasAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { error } = await adminClient
    .from("best_line_submissions")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
