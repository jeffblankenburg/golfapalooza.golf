import { createAdminClient } from "@/lib/supabase/admin";
import { SpectatorHomeContent } from "@/components/SpectatorHomeContent";

export default async function SpectatorPage() {
  const adminClient = createAdminClient();

  // Phase 1: active trip
  const { data: trip } = await adminClient
    .from("trip_settings")
    .select("id, trip_name, trip_year, start_date, location, course_id")
    .eq("status", "active")
    .single();

  if (!trip) {
    return (
      <SpectatorHomeContent trip={null} />
    );
  }

  // Phase 2: course + latest article in parallel
  const [courseResult, latestArticleResult] = await Promise.all([
    trip.course_id
      ? adminClient.from("courses").select("name, city, state").eq("id", trip.course_id).single()
      : Promise.resolve({ data: null } as { data: null }),
    adminClient
      .from("articles")
      .select("id, title, content, publish_at, featured_image_url, featured_image_focal_x, featured_image_focal_y, featured_image:gallery_items!articles_featured_image_id_fkey(media_url, thumbnail_url)")
      .eq("trip_id", trip.id)
      .not("publish_at", "is", null)
      .lte("publish_at", new Date().toISOString())
      .order("publish_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Process course venue
  let courseVenue: string | null = null;
  if (courseResult.data) {
    const course = courseResult.data as { name: string; city: string; state: string };
    const parts = [course.name, course.city, course.state].filter(Boolean);
    courseVenue = parts.join(", ") || null;
  }

  // Process latest article
  let latestArticle = null;
  if (latestArticleResult.data) {
    const d = latestArticleResult.data;
    const img = Array.isArray(d.featured_image) ? d.featured_image[0] : d.featured_image;
    const preview = (d.content || "")
      .replace(/[#*_~`>\[\]()!|\\-]/g, "")
      .replace(/\n+/g, " ")
      .trim()
      .slice(0, 300);
    latestArticle = {
      id: d.id,
      title: d.title,
      publishAt: d.publish_at!,
      imageUrl: img?.media_url || img?.thumbnail_url || d.featured_image_url || null,
      preview: preview || null,
      focalX: d.featured_image_focal_x ?? 50,
      focalY: d.featured_image_focal_y ?? 50,
    };
  }

  return (
    <SpectatorHomeContent
      trip={{
        trip_name: trip.trip_name,
        trip_year: trip.trip_year,
        start_date: trip.start_date,
        location: trip.location,
      }}
      courseName={courseVenue}
      latestArticle={latestArticle}
    />
  );
}
