import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";
import { checkCourseEditAccess, stampCourseEdit } from "@/lib/courses/edit-access";

/**
 * Issue #133. Per-hole image upload (overhead and green close-up). Stored
 * in the `course-images` Supabase Storage bucket. The image URL is shared
 * across every tee on the same (course_id, hole_number).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const effectiveUserId = await getEffectiveUserId(user.id);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  const file = formData.get("file") as File | null;
  const holeId = formData.get("holeId") as string | null;
  const imageType = formData.get("imageType") as string | null;
  const courseId = formData.get("courseId") as string | null;
  const holeNumber = formData.get("holeNumber") as string | null;

  if (!file || !holeId || !imageType || !courseId || !holeNumber) {
    return NextResponse.json(
      { error: "file, holeId, imageType, courseId, and holeNumber are required" },
      { status: 400 },
    );
  }
  if (imageType !== "overhead" && imageType !== "green") {
    return NextResponse.json(
      { error: "imageType must be 'overhead' or 'green'" },
      { status: 400 },
    );
  }

  const access = await checkCourseEditAccess(courseId);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason === "not_found" ? "Course not found" : "Course is locked" },
      { status: access.reason === "not_found" ? 404 : 403 },
    );
  }

  const admin = createAdminClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${courseId}/hole-${holeNumber.padStart(2, "0")}/${imageType}.${ext}`;

  const { data: uploaded, error: uploadError } = await admin.storage
    .from("course-images")
    .upload(path, file, { cacheControl: "31536000", upsert: true });
  if (uploadError) {
    return NextResponse.json(
      { error: `Failed to upload image. Make sure the course-images bucket exists in Supabase. ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data: urlData } = admin.storage.from("course-images").getPublicUrl(uploaded.path);
  const imageUrl = urlData.publicUrl;

  const column = imageType === "overhead" ? "overhead_image_url" : "green_image_url";
  const { error: updateError } = await admin
    .from("course_holes")
    .update({ [column]: imageUrl })
    .eq("course_id", courseId)
    .eq("hole_number", parseInt(holeNumber));
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await stampCourseEdit(courseId, effectiveUserId);
  return NextResponse.json({ url: imageUrl });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const effectiveUserId = await getEffectiveUserId(user.id);

  const { searchParams } = new URL(request.url);
  const holeId = searchParams.get("holeId");
  const imageType = searchParams.get("imageType");

  if (!holeId || !imageType) {
    return NextResponse.json({ error: "holeId and imageType are required" }, { status: 400 });
  }
  if (imageType !== "overhead" && imageType !== "green") {
    return NextResponse.json({ error: "imageType must be 'overhead' or 'green'" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: hole } = await admin
    .from("course_holes")
    .select("id, course_id, hole_number, overhead_image_url, green_image_url")
    .eq("id", holeId)
    .maybeSingle();
  if (!hole) {
    return NextResponse.json({ error: "Hole not found" }, { status: 404 });
  }

  const access = await checkCourseEditAccess(hole.course_id);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason === "not_found" ? "Course not found" : "Course is locked" },
      { status: access.reason === "not_found" ? 404 : 403 },
    );
  }

  const column = imageType === "overhead" ? "overhead_image_url" : "green_image_url";
  const currentUrl = hole[column as keyof typeof hole] as string | null;
  if (currentUrl) {
    const match = currentUrl.match(/course-images\/(.+?)(\?|$)/);
    if (match) {
      await admin.storage.from("course-images").remove([match[1]]);
    }
  }

  const { error } = await admin
    .from("course_holes")
    .update({ [column]: null })
    .eq("course_id", hole.course_id)
    .eq("hole_number", hole.hole_number);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await stampCourseEdit(hole.course_id, effectiveUserId);
  return NextResponse.json({ success: true });
}
