import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCachedCourse } from "@/lib/golf-course-api/cache";

/**
 * @swagger
 * /api/courses/{courseId}:
 *   get:
 *     summary: Get course details
 *     description: Get detailed information about a golf course including tees and holes
 *     tags: [Courses]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The course ID
 *     responses:
 *       200:
 *         description: Course details with tees and holes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 course:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Course'
 *                     - type: object
 *                       properties:
 *                         tees:
 *                           type: array
 *                           items:
 *                             allOf:
 *                               - $ref: '#/components/schemas/CourseTee'
 *                               - type: object
 *                                 properties:
 *                                   holes:
 *                                     type: array
 *                                     items:
 *                                       $ref: '#/components/schemas/CourseHole'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Course not found
 *       500:
 *         description: Server error
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { courseId } = await params;

  try {
    const course = await getCachedCourse(courseId);

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    return NextResponse.json({ course });
  } catch (error) {
    console.error("Error fetching course:", error);
    return NextResponse.json(
      { error: "Failed to fetch course" },
      { status: 500 }
    );
  }
}
