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
  hole_name: string | null;
  par: number;
  handicap_index: number;
  yards: number | null;
  meters: number | null;
  tee_latitude: number | null;
  tee_longitude: number | null;
  green_latitude: number | null;
  green_longitude: number | null;
  created_at: string;
}

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
// Orthogonal to RoundType (which encodes hole count). "individual" = everyone
// plays their own ball, WHS handicap-eligible. "scramble" = the whole group
// plays one team ball, one score per hole, excluded from handicap.
export type RoundFormat = "individual" | "scramble";

export interface Round {
  id: string;
  created_by: string;
  course_id: string;
  tee_id: string;
  round_date: string;
  round_type: RoundType;
  format: RoundFormat;
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
  // NULL for guest players (non-app participants). Exactly one of user_id /
  // guest_name is set per row — see migration 00161.
  user_id: string | null;
  guest_name: string | null;
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
  // NULL for guest players — use guest_name for the display name in that case.
  user: {
    id: string;
    display_name: string;
    full_name: string | null;
  } | null;
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
  score_to_par: number | null;
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
}

export interface RoundSummary {
  id: string;
  round_date: string;
  round_type: RoundType;
  status: RoundStatus;
  course_name: string;
  tee_name: string;
  par: number;
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
// Rookie Nomination Types
// ===========================================

export interface RookieNomination {
  id: string;
  nominator_id: string;
  phone: string;
  first_name: string;
  last_name: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_user_id: string | null;
  created_at: string;
  updated_at: string;
}

// ===========================================
// Polls
// ===========================================

export type PollAudienceType = "everyone" | "event" | "custom";
export type PollStatus = "draft" | "scheduled" | "active" | "closed";
export type PollQuestionType = "single" | "multi" | "text";

export interface PollOption {
  id: string;
  question_id: string;
  option_text: string;
  order_index: number;
}

export interface PollQuestion {
  id: string;
  poll_id: string;
  question_text: string;
  question_type: PollQuestionType;
  max_selections: number | null;
  max_length: number | null;
  order_index: number;
  options: PollOption[];
}

export interface Poll {
  id: string;
  title: string;
  description: string | null;
  audience_type: PollAudienceType;
  audience_user_ids: string[] | null;
  trip_id: string | null;
  is_anonymous: boolean;
  send_notification_on_launch: boolean;
  show_results_while_open: boolean;
  // When true AND show_results_while_open is true, eligible users see live
  // results even before they vote. Admin-set; no effect if show_results_while_open
  // is false.
  show_results_before_vote: boolean;
  status: PollStatus;
  starts_at: string | null;
  ends_at: string | null;
  // created_by = the admin who physically authored the poll.
  created_by: string | null;
  // on_behalf_of_user_id = the Loozer the poll was created for (admin-only
  // attribution, distinct from the audience). Issue #142.
  on_behalf_of_user_id: string | null;
  created_at: string;
  updated_at: string;
  questions: PollQuestion[];
}

export interface PollAnswer {
  question_id: string;
  option_id: string | null;
  text_answer: string | null;
}

export interface PollResponse {
  id: string;
  poll_id: string;
  user_id: string;
  submitted_at: string;
  updated_at: string;
  answers: PollAnswer[];
}

export interface PollVoter {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface PollOptionResult {
  option_id: string;
  option_text: string;
  count: number;
  // Populated only on attributed (non-anonymous) admin views.
  voters?: PollVoter[];
}

export interface PollTextAnswer {
  text: string;
  // Only present when admin is viewing a non-anonymous poll
  user_id?: string;
  display_name?: string;
}

export interface PollQuestionResults {
  question_id: string;
  question_text: string;
  question_type: PollQuestionType;
  options?: PollOptionResult[];
  text_answers?: PollTextAnswer[];
}

export interface PollResults {
  poll_id: string;
  total_respondents: number;
  questions: PollQuestionResults[];
}
