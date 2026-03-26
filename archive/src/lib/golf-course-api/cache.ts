import { createAdminClient } from "@/lib/supabase/admin";
import type { Course, CourseComplete } from "@/types/golf";
import type { GolfCourseAPICourse, GolfCourseAPITee } from "./types";

const CACHE_DAYS = 30;

// Check if course data is stale
function isStale(cachedAt: string): boolean {
  const cached = new Date(cachedAt);
  const now = new Date();
  const diffDays = (now.getTime() - cached.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > CACHE_DAYS;
}

// Search cached courses (only returns courses that have tees)
export async function searchCachedCourses(
  query: string,
  limit: number = 20
): Promise<Course[]> {
  const supabase = createAdminClient();

  // Get courses that match the query AND have at least one tee
  const { data, error } = await supabase
    .from("courses")
    .select(`
      *,
      course_tees!inner(id)
    `)
    .or(`name.ilike.%${query}%,club_name.ilike.%${query}%,city.ilike.%${query}%`)
    .limit(limit);

  if (error) {
    console.error("Error searching cached courses:", error);
    return [];
  }

  // Remove the tees from the response (we just used it for filtering)
  return (data || []).map(({ course_tees, ...course }) => course);
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
export async function cacheCourseFromAPI(apiCourse: GolfCourseAPICourse): Promise<Course | null> {
  const supabase = createAdminClient();

  const externalId = apiCourse.id.toString();

  // Determine hole count from tees
  const allTees = [...(apiCourse.tees.male || []), ...(apiCourse.tees.female || [])];

  // Skip courses without tee data - they're not usable for scoring
  if (allTees.length === 0) {
    return null;
  }

  // Check if already cached with tees
  const existing = await getCourseByExternalId(externalId);
  if (existing && !isStale(existing.cached_at)) {
    // Check if course has tees cached
    const { data: existingTees } = await supabase
      .from("course_tees")
      .select("id")
      .eq("course_id", existing.id)
      .limit(1);

    if (existingTees && existingTees.length > 0) {
      return existing;
    }
    // If no tees, continue to cache them
  }
  const holeCount = allTees.length > 0 ? allTees[0].number_of_holes : 18;

  // Upsert course
  const courseData = {
    external_id: externalId,
    name: apiCourse.course_name,
    club_name: apiCourse.club_name,
    address: apiCourse.location.address,
    city: apiCourse.location.city,
    state: apiCourse.location.state,
    country: apiCourse.location.country,
    latitude: apiCourse.location.latitude,
    longitude: apiCourse.location.longitude,
    hole_count: holeCount as 9 | 18,
    cached_at: new Date().toISOString(),
  };

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .upsert(courseData, { onConflict: "external_id" })
    .select()
    .single();

  if (courseError || !course) {
    console.error("Error caching course:", courseError);
    return null;
  }

  // Cache tees (combine male and female tees)
  const teesToCache: { tee: GolfCourseAPITee; gender: string }[] = [
    ...(apiCourse.tees.male || []).map(t => ({ tee: t, gender: "men" })),
    ...(apiCourse.tees.female || []).map(t => ({ tee: t, gender: "women" })),
  ];

  for (const { tee: apiTee, gender } of teesToCache) {
    const teeData = {
      course_id: course.id,
      tee_name: apiTee.tee_name,
      gender: gender,
      course_rating: apiTee.course_rating,
      slope_rating: apiTee.slope_rating,
      front_nine_rating: apiTee.front_course_rating || null,
      front_nine_slope: apiTee.front_slope_rating || null,
      back_nine_rating: apiTee.back_course_rating || null,
      back_nine_slope: apiTee.back_slope_rating || null,
      total_yards: apiTee.total_yards || null,
      total_meters: apiTee.total_meters || null,
      par: apiTee.par_total,
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
    if (apiTee.holes && apiTee.holes.length > 0) {
      const holesData = apiTee.holes.map((apiHole, index) => ({
        course_id: course.id,
        tee_id: tee.id,
        hole_number: index + 1,
        par: apiHole.par,
        handicap_index: apiHole.handicap,
        yards: apiHole.yardage || null,
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
  }

  return course;
}

// Get all cached courses (for browsing) - only courses with tees
export async function getAllCachedCourses(
  limit: number = 50,
  offset: number = 0
): Promise<Course[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("courses")
    .select(`
      *,
      course_tees!inner(id)
    `)
    .order("name")
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Error fetching courses:", error);
    return [];
  }

  // Remove the tees from the response (we just used it for filtering)
  return (data || []).map(({ course_tees, ...course }) => course);
}

// Haversine formula to calculate distance between two points in miles
function calculateDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Search cached courses by location - returns courses with tees within radius
export async function searchCachedCoursesByLocation(
  latitude: number,
  longitude: number,
  radiusMiles: number = 2
): Promise<(Course & { distance: number })[]> {
  const supabase = createAdminClient();

  // Calculate bounding box for initial filter (rough approximation)
  const latDelta = radiusMiles / 69; // ~69 miles per degree latitude
  const lngDelta = radiusMiles / (69 * Math.cos((latitude * Math.PI) / 180));

  const { data, error } = await supabase
    .from("courses")
    .select(`
      *,
      course_tees!inner(id)
    `)
    .gte("latitude", latitude - latDelta)
    .lte("latitude", latitude + latDelta)
    .gte("longitude", longitude - lngDelta)
    .lte("longitude", longitude + lngDelta);

  if (error) {
    console.error("Error searching courses by location:", error);
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Calculate actual distances and filter by radius
  const coursesWithDistance = data
    .map(({ course_tees, ...course }) => ({
      ...course,
      distance: calculateDistanceMiles(
        latitude,
        longitude,
        course.latitude,
        course.longitude
      ),
    }))
    .filter((course) => course.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);

  return coursesWithDistance;
}
