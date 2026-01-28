// ===========================================
// Course Types
// ===========================================

export interface Course {
  id: string;
  external_id: string | null;
  name: string;
  club_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  postal_code: string | null;
  phone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  hole_count: 9 | 18;
  cached_at: string;
  created_at: string;
  updated_at: string;
}

export interface CourseTee {
  id: string;
  course_id: string;
  tee_name: string;
  tee_color: string | null;
  gender: "men" | "women" | "all";
  course_rating: number;
  slope_rating: number;
  front_nine_rating: number | null;
  front_nine_slope: number | null;
  back_nine_rating: number | null;
  back_nine_slope: number | null;
  total_yards: number | null;
  total_meters: number | null;
  par: number;
  created_at: string;
  updated_at: string;
}

export interface CourseHole {
  id: string;
  course_id: string;
  tee_id: string;
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number | null;
  meters: number | null;
  created_at: string;
}

// Course with related data
export interface CourseWithTees extends Course {
  tees: CourseTee[];
}

export interface CourseTeeWithHoles extends CourseTee {
  holes: CourseHole[];
}

export interface CourseComplete extends Course {
  tees: CourseTeeWithHoles[];
}

// ===========================================
// Round Types
// ===========================================

export type RoundType = "9-front" | "9-back" | "18";
export type RoundStatus = "in_progress" | "completed" | "abandoned";

export interface Round {
  id: string;
  created_by: string;
  course_id: string;
  tee_id: string;
  round_date: string;
  round_type: RoundType;
  status: RoundStatus;
  weather_conditions: string | null;
  notes: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoundPlayer {
  id: string;
  round_id: string;
  user_id: string;
  tee_id: string;
  player_position: number;
  is_scorer: boolean;
  playing_handicap: number | null;
  final_gross_score: number | null;
  final_adjusted_score: number | null;
  final_net_score: number | null;
  score_differential: number | null;
  created_at: string;
  updated_at: string;
}

export interface RoundScore {
  id: string;
  round_id: string;
  round_player_id: string;
  hole_number: number;
  strokes: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  green_in_regulation: boolean | null;
  penalty_strokes: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Round with related data
export interface RoundPlayerWithUser extends RoundPlayer {
  user: {
    id: string;
    display_name: string;
    full_name: string | null;
  };
  tee: CourseTee;
  scores: RoundScore[];
}

export interface RoundWithDetails extends Round {
  course: Course;
  tee: CourseTee;
  players: RoundPlayerWithUser[];
}

// ===========================================
// Handicap Types
// ===========================================

export interface PlayerHandicap {
  id: string;
  user_id: string;
  handicap_index: number | null;
  low_handicap_index: number | null;
  rounds_used: number;
  last_calculated_at: string | null;
  effective_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface HandicapHistory {
  id: string;
  user_id: string;
  handicap_index: number;
  rounds_used: number;
  differentials_used: number[] | null;
  calculation_method: string | null;
  effective_date: string;
  created_at: string;
}

// ===========================================
// Score Entry Types
// ===========================================

export interface ScoreUpdate {
  round_player_id: string;
  hole_number: number;
  strokes?: number | null;
  putts?: number | null;
  fairway_hit?: boolean | null;
  green_in_regulation?: boolean | null;
  penalty_strokes?: number;
}

export interface HoleScoreDisplay {
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number | null;
  strokes: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  green_in_regulation: boolean | null;
  score_to_par: number | null; // -2 for eagle, -1 for birdie, etc.
}

// ===========================================
// API Response Types
// ===========================================

export interface CourseSearchResult {
  id: string;
  external_id: string | null;
  name: string;
  club_name: string | null;
  city: string | null;
  state: string | null;
  hole_count: 9 | 18;
}

export interface CreateRoundRequest {
  course_id: string;
  tee_id: string;
  round_type: RoundType;
  round_date?: string;
  players: {
    user_id: string;
    tee_id: string;
    is_scorer: boolean;
  }[];
}

export interface RoundSummary {
  id: string;
  round_date: string;
  round_type: RoundType;
  status: RoundStatus;
  course_name: string;
  final_score: number | null;
  score_to_par: number | null;
  score_differential: number | null;
}

// ===========================================
// Handicap Calculation Types
// ===========================================

export interface RoundDifferential {
  round_id: string;
  round_date: string;
  course_name: string;
  adjusted_gross_score: number;
  course_rating: number;
  slope_rating: number;
  differential: number;
}

export interface HandicapCalculation {
  handicap_index: number;
  rounds_used: number;
  total_rounds: number;
  calculation_method: string;
  differentials: RoundDifferential[];
  low_handicap_index: number;
}

// ===========================================
// User Types (extended for golf)
// ===========================================

export interface GolfUser {
  id: string;
  display_name: string;
  full_name: string | null;
  handicap?: PlayerHandicap | null;
}
