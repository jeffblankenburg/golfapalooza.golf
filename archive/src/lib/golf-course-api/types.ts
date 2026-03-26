// Types for GolfCourseAPI.com responses

export interface GolfCourseAPIResponse {
  courses: GolfCourseAPICourse[];
}

export interface GolfCourseAPICourseLocation {
  address: string;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
}

export interface GolfCourseAPIHole {
  par: number;
  yardage: number;
  handicap: number;
}

export interface GolfCourseAPITee {
  tee_name: string;
  course_rating: number;
  slope_rating: number;
  bogey_rating?: number;
  total_yards: number;
  total_meters: number;
  number_of_holes: number;
  par_total: number;
  front_course_rating?: number;
  front_slope_rating?: number;
  front_bogey_rating?: number;
  back_course_rating?: number;
  back_slope_rating?: number;
  back_bogey_rating?: number;
  holes: GolfCourseAPIHole[];
}

export interface GolfCourseAPITees {
  male?: GolfCourseAPITee[];
  female?: GolfCourseAPITee[];
}

export interface GolfCourseAPICourse {
  id: number;
  club_name: string;
  course_name: string;
  location: GolfCourseAPICourseLocation;
  tees: GolfCourseAPITees;
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
