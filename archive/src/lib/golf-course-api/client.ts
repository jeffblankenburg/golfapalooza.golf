import type {
  GolfCourseAPIResponse,
  GolfCourseAPICourse,
  GolfCourseAPISearchParams,
} from "./types";

const BASE_URL = "https://api.golfcourseapi.com/v1";

class GolfCourseAPIClient {
  private getApiKey(): string {
    return process.env.GOLF_COURSE_API_KEY || "";
  }

  private async fetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("Golf Course API key not configured");
    }

    const url = new URL(`${BASE_URL}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.append(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("API rate limit exceeded (300 requests/day)");
      }
      throw new Error(`Golf Course API error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  }

  async searchCourses(params: GolfCourseAPISearchParams): Promise<GolfCourseAPICourse[]> {
    const queryParams: Record<string, string> = {};

    if (params.search_query) queryParams.search_query = params.search_query;

    // Use /search endpoint for searching by name
    const response = await this.fetch<GolfCourseAPIResponse>(
      "/search",
      queryParams
    );

    return response.courses || [];
  }

  async getCourseDetails(courseId: number): Promise<GolfCourseAPICourse | null> {
    try {
      const response = await this.fetch<{ course: GolfCourseAPICourse }>(
        `/courses/${courseId}`
      );
      return response.course || null;
    } catch (error) {
      console.error("Error fetching course details:", error);
      return null;
    }
  }

  async searchCoursesByLocation(
    latitude: number,
    longitude: number,
    radiusMiles: number = 2
  ): Promise<GolfCourseAPICourse[]> {
    try {
      const response = await this.fetch<GolfCourseAPIResponse>("/courses", {
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        radius_miles: radiusMiles.toString(),
      });
      return response.courses || [];
    } catch (error) {
      console.error("Error searching courses by location:", error);
      return [];
    }
  }

  isConfigured(): boolean {
    return !!this.getApiKey();
  }
}

// Export singleton instance
export const golfCourseAPI = new GolfCourseAPIClient();
