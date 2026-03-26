import { createClient } from "@/lib/supabase/server";
import { CourseData, HoleData } from "./course-data";

interface DbHole {
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number;
  tee_id: string;
  overhead_image_url: string | null;
  green_image_url: string | null;
}

export async function getCourseData(): Promise<CourseData | null> {
  const supabase = await createClient();

  // Get active trip with course_id
  const { data: trip } = await supabase
    .from("trip_settings")
    .select("course_id")
    .eq("status", "active")
    .single();

  if (!trip?.course_id) return null;

  // Get course
  const { data: course } = await supabase
    .from("courses")
    .select("*")
    .eq("id", trip.course_id)
    .single();

  if (!course) return null;

  // Get all tees
  const { data: tees } = await supabase
    .from("course_tees")
    .select("*")
    .eq("course_id", course.id)
    .order("tee_name");

  if (!tees || tees.length === 0) return null;

  // Get ALL holes for this course (across all tees)
  const { data: allHoles } = await supabase
    .from("course_holes")
    .select("*")
    .eq("course_id", course.id)
    .order("hole_number");

  // Images are stored on the first tee's holes — collect them
  const firstTeeId = tees[0].id;
  const imageMap: Record<
    number,
    { overhead: string | null; green: string | null }
  > = {};
  for (const h of (allHoles || []) as DbHole[]) {
    if (h.tee_id === firstTeeId) {
      imageMap[h.hole_number] = {
        overhead: h.overhead_image_url,
        green: h.green_image_url,
      };
    }
  }

  // Group holes by tee, applying shared images
  const holesByTee: Record<string, HoleData[]> = {};
  for (const tee of tees) {
    holesByTee[tee.id] = ((allHoles || []) as DbHole[])
      .filter((h) => h.tee_id === tee.id)
      .map((h) => ({
        number: h.hole_number,
        par: h.par,
        handicap: h.handicap_index,
        yards: h.yards || 0,
        overheadImageUrl: imageMap[h.hole_number]?.overhead || null,
        greenImageUrl: imageMap[h.hole_number]?.green || null,
      }));
  }

  return {
    name: course.name || "Course TBD",
    location: [course.city, course.state].filter(Boolean).join(", ") || "",
    tees: tees.map(
      (t: {
        id: string;
        tee_name: string;
        course_rating: number;
        slope_rating: number;
        par: number;
      }) => ({
        id: t.id,
        name: t.tee_name,
        rating: t.course_rating,
        slope: t.slope_rating,
        par: t.par,
      })
    ),
    holesByTee,
    defaultTeeId: firstTeeId,
  };
}
