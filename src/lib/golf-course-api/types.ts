// Types for GolfCourseAPI.com responses

export interface GolfCourseAPIResponse<T> {
  status: string;
  data: T;
}

export interface GolfCourseAPIClub {
  id: number;
  club_name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  phone: string;
  website: string;
  latitude: number;
  longitude: number;
  courses: GolfCourseAPICourse[];
}

export interface GolfCourseAPICourse {
  id: number;
  course_name: string;
  num_holes: number;
  tees: GolfCourseAPITee[];
}

export interface GolfCourseAPITee {
  id: number;
  tee_name: string;
  tee_color: string;
  par: number;
  distance: number;
  distance_unit: "yards" | "meters";
  course_rating: number;
  slope_rating: number;
  front_course_rating?: number;
  front_slope_rating?: number;
  back_course_rating?: number;
  back_slope_rating?: number;
  holes: GolfCourseAPIHole[];
}

export interface GolfCourseAPIHole {
  hole_number: number;
  par: number;
  handicap: number;
  distance: number;
}

export interface GolfCourseAPISearchParams {
  search_query?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  radius_miles?: number;
  page?: number;
  per_page?: number;
}

export interface GolfCourseAPISearchResult {
  id: number;
  club_name: string;
  city: string;
  state: string;
  country: string;
  num_courses: number;
  distance_miles?: number;
}
