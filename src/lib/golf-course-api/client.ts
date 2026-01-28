import type {
  GolfCourseAPIResponse,
  GolfCourseAPIClub,
  GolfCourseAPISearchParams,
  GolfCourseAPISearchResult,
} from "./types";

const BASE_URL = "https://api.golfcourseapi.com/v1";

class GolfCourseAPIClient {
  private apiKey: string;

  constructor() {
    const key = process.env.GOLF_COURSE_API_KEY;
    if (!key) {
      console.warn("GOLF_COURSE_API_KEY not set - external course search disabled");
    }
    this.apiKey = key || "";
  }

  private async fetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    if (!this.apiKey) {
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
        Authorization: `Key ${this.apiKey}`,
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

  async searchCourses(params: GolfCourseAPISearchParams): Promise<GolfCourseAPISearchResult[]> {
    const queryParams: Record<string, string> = {};

    if (params.search_query) queryParams.search_query = params.search_query;
    if (params.city) queryParams.city = params.city;
    if (params.state) queryParams.state = params.state;
    if (params.country) queryParams.country = params.country;
    if (params.postal_code) queryParams.postal_code = params.postal_code;
    if (params.latitude) queryParams.latitude = params.latitude.toString();
    if (params.longitude) queryParams.longitude = params.longitude.toString();
    if (params.radius_miles) queryParams.radius_miles = params.radius_miles.toString();
    if (params.page) queryParams.page = params.page.toString();
    if (params.per_page) queryParams.per_page = params.per_page.toString();

    const response = await this.fetch<GolfCourseAPIResponse<GolfCourseAPISearchResult[]>>(
      "/clubs",
      queryParams
    );

    return response.data || [];
  }

  async getClubDetails(clubId: number): Promise<GolfCourseAPIClub | null> {
    try {
      const response = await this.fetch<GolfCourseAPIResponse<GolfCourseAPIClub>>(
        `/clubs/${clubId}`
      );
      return response.data || null;
    } catch (error) {
      console.error("Error fetching club details:", error);
      return null;
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

// Export singleton instance
export const golfCourseAPI = new GolfCourseAPIClient();
