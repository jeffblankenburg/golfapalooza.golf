-- ===========================================
-- Allow any authenticated user to manage courses, tees, and holes
-- (Previously admin-only for INSERT/UPDATE)
-- DELETE remains admin-only to protect shared data
-- ===========================================

-- Courses: open INSERT/UPDATE to authenticated users
DROP POLICY IF EXISTS "Admins can insert courses" ON courses;
DROP POLICY IF EXISTS "Admins can update courses" ON courses;

CREATE POLICY "Authenticated users can insert courses" ON courses
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update courses" ON courses
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Course Tees: open INSERT/UPDATE to authenticated users
DROP POLICY IF EXISTS "Admins can insert course_tees" ON course_tees;
DROP POLICY IF EXISTS "Admins can update course_tees" ON course_tees;

CREATE POLICY "Authenticated users can insert course_tees" ON course_tees
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update course_tees" ON course_tees
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Course Holes: open INSERT/UPDATE to authenticated users
DROP POLICY IF EXISTS "Admins can insert course_holes" ON course_holes;
DROP POLICY IF EXISTS "Admins can update course_holes" ON course_holes;

CREATE POLICY "Authenticated users can insert course_holes" ON course_holes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update course_holes" ON course_holes
  FOR UPDATE USING (auth.uid() IS NOT NULL);
