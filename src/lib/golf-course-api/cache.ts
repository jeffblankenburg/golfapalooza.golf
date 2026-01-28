import { createAdminClient } from "@/lib/supabase/admin";
import type { Course, CourseTee, CourseHole, CourseComplete } from "@/types/golf";
import type { GolfCourseAPIClub } from "./types";

const CACHE_DAYS = 30;

// Check if course data is stale
function isStale(cachedAt: string): boolean {
  const cached = new Date(cachedAt);
  const now = new Date();
  const diffDays = (now.getTime() - cached.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > CACHE_DAYS;
}

// Search cached courses
export async function searchCachedCourses(
  query: string,
  limit: number = 20
): Promise<Course[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .or(`name.ilike.%${query}%,club_name.ilike.%${query}%,city.ilike.%${query}%`)
    .limit(limit);

  if (error) {
    console.error("Error searching cached courses:", error);
    return [];
  }

  return data || [];
}

// Get course by ID with all related data
export async function getCachedCourse(courseId: string): Promise<CourseComplete | null> {
  const supabase = createAdminClient();

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .single();

  if (courseError || !course) {
    return null;
  }

  const { data: tees, error: teesError } = await supabase
    .from("course_tees")
    .select("*")
    .eq("course_id", courseId)
    .order("total_yards", { ascending: false });

  if (teesError) {
    console.error("Error fetching tees:", teesError);
    return { ...course, tees: [] };
  }

  // Fetch holes for each tee
  const teesWithHoles = await Promise.all(
    (tees || []).map(async (tee) => {
      const { data: holes } = await supabase
        .from("course_holes")
        .select("*")
        .eq("tee_id", tee.id)
        .order("hole_number");

      return { ...tee, holes: holes || [] };
    })
  );

  return { ...course, tees: teesWithHoles };
}

// Get course by external ID
export async function getCourseByExternalId(externalId: string): Promise<Course | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("external_id", externalId)
    .single();

  if (error) {
    return null;
  }

  return data;
}

// Cache course from API response
export async function cacheCourseFromAPI(club: GolfCourseAPIClub): Promise<Course | null> {
  const supabase = createAdminClient();

  // For each course in the club
  for (const apiCourse of club.courses) {
    const externalId = `${club.id}-${apiCourse.id}`;

    // Check if already cached
    const existing = await getCourseByExternalId(externalId);
    if (existing && !isStale(existing.cached_at)) {
      return existing;
    }

    // Upsert course
    const courseData = {
      external_id: externalId,
      name: apiCourse.course_name,
      club_name: club.club_name,
      address: club.address,
      city: club.city,
      state: club.state,
      country: club.country,
      postal_code: club.postal_code,
      phone: club.phone,
      website: club.website,
      latitude: club.latitude,
      longitude: club.longitude,
      hole_count: apiCourse.num_holes as 9 | 18,
      cached_at: new Date().toISOString(),
    };

    const { data: course, error: courseError } = await supabase
      .from("courses")
      .upsert(courseData, { onConflict: "external_id" })
      .select()
      .single();

    if (courseError || !course) {
      console.error("Error caching course:", courseError);
      continue;
    }

    // Cache tees
    for (const apiTee of apiCourse.tees) {
      const teeData = {
        course_id: course.id,
        tee_name: apiTee.tee_name,
        tee_color: apiTee.tee_color,
        course_rating: apiTee.course_rating,
        slope_rating: apiTee.slope_rating,
        front_nine_rating: apiTee.front_course_rating || null,
        front_nine_slope: apiTee.front_slope_rating || null,
        back_nine_rating: apiTee.back_course_rating || null,
        back_nine_slope: apiTee.back_slope_rating || null,
        total_yards: apiTee.distance_unit === "yards" ? apiTee.distance : null,
        total_meters: apiTee.distance_unit === "meters" ? apiTee.distance : null,
        par: apiTee.par,
      };

      const { data: tee, error: teeError } = await supabase
        .from("course_tees")
        .upsert(teeData, { onConflict: "course_id,tee_name" })
        .select()
        .single();

      if (teeError || !tee) {
        console.error("Error caching tee:", teeError);
        continue;
      }

      // Cache holes
      const holesData = apiTee.holes.map((apiHole) => ({
        course_id: course.id,
        tee_id: tee.id,
        hole_number: apiHole.hole_number,
        par: apiHole.par,
        handicap_index: apiHole.handicap,
        yards: apiTee.distance_unit === "yards" ? apiHole.distance : null,
        meters: apiTee.distance_unit === "meters" ? apiHole.distance : null,
      }));

      // Delete existing holes for this tee and insert new ones
      await supabase.from("course_holes").delete().eq("tee_id", tee.id);

      const { error: holesError } = await supabase
        .from("course_holes")
        .insert(holesData);

      if (holesError) {
        console.error("Error caching holes:", holesError);
      }
    }

    return course;
  }

  return null;
}

// Get all cached courses (for browsing)
export async function getAllCachedCourses(
  limit: number = 50,
  offset: number = 0
): Promise<Course[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .order("name")
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Error fetching courses:", error);
    return [];
  }

  return data || [];
}
