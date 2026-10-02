-- Contest course + tee (#209, Phase 2a scoring). A scramble is played at a course
-- off a specific tee; scoring pulls per-hole par (and hole handicaps) from
-- v2_course_holes for that tee. Nullable — set when the admin picks the course.
-- ON DELETE SET NULL so removing a course/tee from the library doesn't nuke the
-- contest (scores keep their stored strokes; par display just goes blank).

ALTER TABLE public.v2_contests
  ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES public.v2_courses(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tee_id    UUID REFERENCES public.v2_course_tees(id)  ON DELETE SET NULL;
