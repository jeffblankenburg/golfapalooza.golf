-- Bring the legacy rounds history forward into v2 — id-preserving, once.
--
-- Clean because the prerequisites are already id-preserved in the SAME database:
--   • courses/tees/holes were seeded id-preserving from legacy (00210), so every
--     legacy round's course_id/tee_id already resolves in v2 under the same id;
--   • users.id = auth.users.id = v2_profiles.id (00186), so player user_ids map 1:1.
-- So this is a straight INSERT … SELECT (like 00210 / the chat/gallery/music
-- imports). Idempotent (ON CONFLICT DO NOTHING). Personal & global — no org scope.
--
-- Depends on 00224 (v2 scoring tables) + 00210 (course library) + 00186 (profiles).
-- Order matters: rounds → players → scores → handicaps so FKs resolve.

-- Rounds — only where the creator has a v2_profile (created_by is NOT NULL FK).
INSERT INTO public.v2_rounds
  (id, created_by, course_id, tee_id, round_date, round_type, format, status,
   notes, started_at, completed_at, created_at, updated_at)
SELECT
  r.id, r.created_by, r.course_id, r.tee_id, r.round_date, r.round_type, r.format,
  r.status, r.notes, r.started_at, r.completed_at, r.created_at, r.updated_at
FROM public.rounds r
JOIN public.v2_profiles p ON p.id = r.created_by
JOIN public.v2_courses c ON c.id = r.course_id
JOIN public.v2_course_tees t ON t.id = r.tee_id
ON CONFLICT (id) DO NOTHING;

-- Round players — for imported rounds only. Loozer rows need a v2_profile;
-- guest rows (user_id NULL) come as-is. is_scorer is dropped (co-equal ownership).
INSERT INTO public.v2_round_players
  (id, round_id, user_id, guest_name, tee_id, player_position, playing_handicap,
   final_gross_score, final_adjusted_score, final_net_score, score_differential,
   created_at, updated_at)
SELECT
  rp.id, rp.round_id, rp.user_id, rp.guest_name, rp.tee_id, rp.player_position,
  rp.playing_handicap, rp.final_gross_score, rp.final_adjusted_score,
  rp.final_net_score, rp.score_differential, rp.created_at, rp.updated_at
FROM public.round_players rp
JOIN public.v2_rounds vr ON vr.id = rp.round_id
JOIN public.v2_course_tees t ON t.id = rp.tee_id
WHERE rp.user_id IS NULL
   OR EXISTS (SELECT 1 FROM public.v2_profiles p WHERE p.id = rp.user_id)
ON CONFLICT (id) DO NOTHING;

-- Hole-by-hole scores — for imported player rows only.
INSERT INTO public.v2_round_scores
  (id, round_id, round_player_id, hole_number, strokes, putts, fairway_hit,
   green_in_regulation, penalty_strokes, notes, created_at, updated_at)
SELECT
  rs.id, rs.round_id, rs.round_player_id, rs.hole_number, rs.strokes, rs.putts,
  rs.fairway_hit, rs.green_in_regulation, rs.penalty_strokes, rs.notes,
  rs.created_at, rs.updated_at
FROM public.round_scores rs
JOIN public.v2_round_players vrp ON vrp.id = rs.round_player_id
ON CONFLICT (id) DO NOTHING;

-- Handicaps — carry the legacy computed index forward for profiled golfers (the
-- imported rounds already store score_differential, so v2 recalc on any NEW round
-- stays consistent). v2 has no `source` column and no handicap_history table.
INSERT INTO public.v2_player_handicaps
  (id, user_id, handicap_index, low_handicap_index, rounds_used,
   last_calculated_at, effective_date, created_at, updated_at)
SELECT
  ph.id, ph.user_id, ph.handicap_index, ph.low_handicap_index, ph.rounds_used,
  ph.last_calculated_at, ph.effective_date, ph.created_at, ph.updated_at
FROM public.player_handicaps ph
JOIN public.v2_profiles p ON p.id = ph.user_id
ON CONFLICT (id) DO NOTHING;
