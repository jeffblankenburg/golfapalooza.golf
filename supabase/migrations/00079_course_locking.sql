-- ===========================================
-- Add locked flag to courses
-- Admins can lock a course to prevent non-admin edits
-- to the course, tees, and holes
-- ===========================================

ALTER TABLE courses ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false;

-- Replace the authenticated-user UPDATE policies with lock-aware versions
-- Courses: non-admins can only update unlocked courses
DROP POLICY IF EXISTS "Authenticated users can update courses" ON courses;

CREATE POLICY "Authenticated users can update unlocked courses" ON courses
  FOR UPDATE USING (
    is_admin() OR locked = false
  );

-- Course Tees: non-admins can only update tees on unlocked courses
DROP POLICY IF EXISTS "Authenticated users can update course_tees" ON course_tees;

CREATE POLICY "Authenticated users can update tees on unlocked courses" ON course_tees
  FOR UPDATE USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM courses WHERE courses.id = course_tees.course_id AND courses.locked = false
    )
  );

-- Course Holes: non-admins can only update holes on unlocked courses
DROP POLICY IF EXISTS "Authenticated users can update course_holes" ON course_holes;

CREATE POLICY "Authenticated users can update holes on unlocked courses" ON course_holes
  FOR UPDATE USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM courses WHERE courses.id = course_holes.course_id AND courses.locked = false
    )
  );

-- Also prevent non-admins from adding tees/holes to locked courses
DROP POLICY IF EXISTS "Authenticated users can insert course_tees" ON course_tees;

CREATE POLICY "Authenticated users can insert tees on unlocked courses" ON course_tees
  FOR INSERT WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM courses WHERE courses.id = course_tees.course_id AND courses.locked = false
    )
  );

DROP POLICY IF EXISTS "Authenticated users can insert course_holes" ON course_holes;

CREATE POLICY "Authenticated users can insert holes on unlocked courses" ON course_holes
  FOR INSERT WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM courses WHERE courses.id = course_holes.course_id AND courses.locked = false
    )
  );
