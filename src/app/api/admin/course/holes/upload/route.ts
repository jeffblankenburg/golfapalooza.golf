import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function checkIsAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) return null;

  return user;
}

// POST - Upload an image for a specific hole
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const holeId = formData.get("holeId") as string;
    const imageType = formData.get("imageType") as string;
    const courseId = formData.get("courseId") as string;
    const holeNumber = formData.get("holeNumber") as string;

    if (!file || !holeId || !imageType || !courseId || !holeNumber) {
      return NextResponse.json(
        { error: "file, holeId, imageType, courseId, and holeNumber are required" },
        { status: 400 }
      );
    }

    if (imageType !== "overhead" && imageType !== "green") {
      return NextResponse.json(
        { error: "imageType must be 'overhead' or 'green'" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Upload to Supabase Storage
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${courseId}/hole-${holeNumber.padStart(2, "0")}/${imageType}.${ext}`;

    const { data, error: uploadError } = await adminClient.storage
      .from("course-images")
      .upload(path, file, { cacheControl: "3600", upsert: true });

    if (uploadError) {
      return NextResponse.json(
        {
          error: `Failed to upload image. Make sure the course-images bucket exists in Supabase. ${uploadError.message}`,
        },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = adminClient.storage
      .from("course-images")
      .getPublicUrl(data.path);

    const imageUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    // Update hole record with image URL
    const column =
      imageType === "overhead" ? "overhead_image_url" : "green_image_url";

    const { error: updateError } = await adminClient
      .from("course_holes")
      .update({ [column]: imageUrl })
      .eq("id", holeId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: imageUrl });
  } catch (error) {
    console.error("Upload hole image error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}
