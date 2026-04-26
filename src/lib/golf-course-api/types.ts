// Shape of GolfCourseAPI.com responses (https://golfcourseapi.com).
// We only model fields we actually consume.

export interface GcApiHole {
  par: number;
  yardage: number;
  handicap: number;
}

export interface GcApiTee {
  tee_name: string;
  course_rating: number;
  slope_rating: number;
  bogey_rating?: number;
  total_yards: number;
  total_meters?: number;
  number_of_holes: number;
  par_total: number;
  front_course_rating?: number;
  front_slope_rating?: number;
  back_course_rating?: number;
  back_slope_rating?: number;
  holes: GcApiHole[];
}

export interface GcApiTees {
  male?: GcApiTee[];
  female?: GcApiTee[];
}

export interface GcApiLocation {
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

export interface GcApiCourse {
  id: number;
  club_name: string;
  course_name: string;
  location: GcApiLocation;
  tees: GcApiTees;
}

export interface GcApiSearchResponse {
  courses: GcApiCourse[];
}
