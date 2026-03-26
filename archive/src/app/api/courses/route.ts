import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { golfCourseAPI } from "@/lib/golf-course-api/client";
import {
  searchCachedCourses,
  searchCachedCoursesByLocation,
  cacheCourseFromAPI,
  getAllCachedCourses,
} from "@/lib/golf-course-api/cache";

/**
 * @swagger
 * /api/courses:
 *   get:
 *     summary: Search golf courses
 *     description: Search for golf courses by name/location text, or by geographic coordinates. Returns cached results first, then queries external API if needed.
 *     tags: [Courses]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query (course name, city, or state). Min 2 characters.
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *         description: Latitude for geo-based search (use with lng)
 *       - in: query
 *         name: lng
 *         schema:
 *           type: number
 *         description: Longitude for geo-based search (use with lat)
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           default: 2
 *         description: Search radius in miles (for geo search, default 2)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum number of results to return
 *     responses:
 *       200:
 *         description: List of matching courses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 courses:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Course'
 *                 source:
 *                   type: string
 *                   enum: [cache, api+cache]
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const radius = parseFloat(searchParams.get("radius") || "2");
  const limit = parseInt(searchParams.get("limit") || "20");

  try {
    // Geo-based search if lat/lng provided
    if (lat && lng) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);

      if (isNaN(latitude) || isNaN(longitude)) {
        return NextResponse.json(
          { error: "Invalid coordinates" },
          { status: 400 }
        );
      }

      // First check cache for nearby courses
      const cachedNearby = await searchCachedCoursesByLocation(
        latitude,
        longitude,
        radius
      );

      if (cachedNearby.length > 0) {
        return NextResponse.json({ courses: cachedNearby, source: "cache" });
      }

      // Query external API if configured
      if (golfCourseAPI.isConfigured()) {
        try {
          const apiResults = await golfCourseAPI.searchCoursesByLocation(
            latitude,
            longitude,
            radius
          );

          // Cache results from API
          for (const course of apiResults.slice(0, 10)) {
            await cacheCourseFromAPI(course);
          }

          // Re-fetch from cache to get unified format with distances
          const updatedCourses = await searchCachedCoursesByLocation(
            latitude,
            longitude,
            radius
          );
          return NextResponse.json({
            courses: updatedCourses,
            source: "api+cache",
          });
        } catch (apiError) {
          console.error("External API geo search error:", apiError);
          return NextResponse.json({
            courses: cachedNearby,
            source: "cache",
            warning: "External API unavailable",
          });
        }
      }

      return NextResponse.json({ courses: cachedNearby, source: "cache" });
    }

    // Text-based search
    // If no query, return all cached courses
    if (!query || query.length < 2) {
      const courses = await getAllCachedCourses(limit);
      return NextResponse.json({ courses, source: "cache" });
    }

    // First, search cached courses
    const cachedCourses = await searchCachedCourses(query, limit);

    // If we have enough cached results, return them
    if (cachedCourses.length >= 5) {
      return NextResponse.json({ courses: cachedCourses, source: "cache" });
    }

    // If external API is configured and we need more results, search there
    if (golfCourseAPI.isConfigured()) {
      try {
        const apiResults = await golfCourseAPI.searchCourses({
          search_query: query,
          per_page: limit,
        });

        // Cache results from API (API now returns full course data)
        for (const course of apiResults.slice(0, 10)) {
          await cacheCourseFromAPI(course);
        }

        // Re-fetch from cache to get unified format
        const updatedCourses = await searchCachedCourses(query, limit);
        return NextResponse.json({ courses: updatedCourses, source: "api+cache" });
      } catch (apiError) {
        console.error("External API error:", apiError);
        // Fall back to cached results
        return NextResponse.json({
          courses: cachedCourses,
          source: "cache",
          warning: "External API unavailable",
        });
      }
    }

    // Return whatever cached results we have
    return NextResponse.json({ courses: cachedCourses, source: "cache" });
  } catch (error) {
    console.error("Course search error:", error);
    return NextResponse.json(
      { error: "Failed to search courses" },
      { status: 500 }
    );
  }
}
