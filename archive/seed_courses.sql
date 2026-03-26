-- Seed some popular golf courses for testing
-- Run this in Supabase SQL Editor

INSERT INTO courses (external_id, name, club_name, city, state, country, hole_count, cached_at) VALUES
('seed-1', 'Pebble Beach Golf Links', 'Pebble Beach Resorts', 'Pebble Beach', 'CA', 'USA', 18, NOW()),
('seed-2', 'Augusta National Golf Club', 'Augusta National', 'Augusta', 'GA', 'USA', 18, NOW()),
('seed-3', 'St Andrews Old Course', 'St Andrews Links', 'St Andrews', 'Scotland', 'UK', 18, NOW()),
('seed-4', 'Pinehurst No. 2', 'Pinehurst Resort', 'Pinehurst', 'NC', 'USA', 18, NOW()),
('seed-5', 'TPC Sawgrass Stadium Course', 'TPC Sawgrass', 'Ponte Vedra Beach', 'FL', 'USA', 18, NOW()),
('seed-6', 'Torrey Pines South Course', 'Torrey Pines Golf Course', 'La Jolla', 'CA', 'USA', 18, NOW()),
('seed-7', 'Whistling Straits', 'Destination Kohler', 'Sheboygan', 'WI', 'USA', 18, NOW()),
('seed-8', 'Bethpage Black', 'Bethpage State Park', 'Farmingdale', 'NY', 'USA', 18, NOW()),
('seed-9', 'Kiawah Island Ocean Course', 'Kiawah Island Golf Resort', 'Kiawah Island', 'SC', 'USA', 18, NOW()),
('seed-10', 'Muirfield Village Golf Club', 'Muirfield Village', 'Dublin', 'OH', 'USA', 18, NOW())
ON CONFLICT (external_id) DO NOTHING;

-- Add sample tees for Pebble Beach
INSERT INTO course_tees (course_id, tee_name, gender, course_rating, slope_rating, par, total_yards)
SELECT id, 'Blue', 'men', 74.6, 143, 72, 6828
FROM courses WHERE external_id = 'seed-1'
ON CONFLICT (course_id, tee_name) DO NOTHING;

INSERT INTO course_tees (course_id, tee_name, gender, course_rating, slope_rating, par, total_yards)
SELECT id, 'White', 'men', 72.1, 135, 72, 6347
FROM courses WHERE external_id = 'seed-1'
ON CONFLICT (course_id, tee_name) DO NOTHING;

INSERT INTO course_tees (course_id, tee_name, gender, course_rating, slope_rating, par, total_yards)
SELECT id, 'Red', 'women', 72.0, 130, 72, 5197
FROM courses WHERE external_id = 'seed-1'
ON CONFLICT (course_id, tee_name) DO NOTHING;

-- Add sample tees for TPC Sawgrass
INSERT INTO course_tees (course_id, tee_name, gender, course_rating, slope_rating, par, total_yards)
SELECT id, 'Tournament', 'men', 76.8, 155, 72, 7245
FROM courses WHERE external_id = 'seed-5'
ON CONFLICT (course_id, tee_name) DO NOTHING;

INSERT INTO course_tees (course_id, tee_name, gender, course_rating, slope_rating, par, total_yards)
SELECT id, 'Blue', 'men', 73.5, 143, 72, 6631
FROM courses WHERE external_id = 'seed-5'
ON CONFLICT (course_id, tee_name) DO NOTHING;

INSERT INTO course_tees (course_id, tee_name, gender, course_rating, slope_rating, par, total_yards)
SELECT id, 'White', 'men', 70.0, 130, 72, 6059
FROM courses WHERE external_id = 'seed-5'
ON CONFLICT (course_id, tee_name) DO NOTHING;

-- Add sample tees for Bethpage Black
INSERT INTO course_tees (course_id, tee_name, gender, course_rating, slope_rating, par, total_yards)
SELECT id, 'Black', 'men', 77.5, 155, 71, 7468
FROM courses WHERE external_id = 'seed-8'
ON CONFLICT (course_id, tee_name) DO NOTHING;

INSERT INTO course_tees (course_id, tee_name, gender, course_rating, slope_rating, par, total_yards)
SELECT id, 'Blue', 'men', 74.5, 144, 71, 6893
FROM courses WHERE external_id = 'seed-8'
ON CONFLICT (course_id, tee_name) DO NOTHING;

INSERT INTO course_tees (course_id, tee_name, gender, course_rating, slope_rating, par, total_yards)
SELECT id, 'White', 'men', 72.2, 136, 71, 6406
FROM courses WHERE external_id = 'seed-8'
ON CONFLICT (course_id, tee_name) DO NOTHING;

-- Add generic tees for other courses (men's tees)
INSERT INTO course_tees (course_id, tee_name, gender, course_rating, slope_rating, par, total_yards)
SELECT id, 'Championship', 'men', 74.5, 140, 72, 7000
FROM courses WHERE external_id IN ('seed-2', 'seed-3', 'seed-4', 'seed-6', 'seed-7', 'seed-9', 'seed-10')
  AND NOT EXISTS (SELECT 1 FROM course_tees WHERE course_tees.course_id = courses.id);

INSERT INTO course_tees (course_id, tee_name, gender, course_rating, slope_rating, par, total_yards)
SELECT c.id, 'Regular', 'men', 71.5, 130, 72, 6400
FROM courses c
WHERE c.external_id IN ('seed-2', 'seed-3', 'seed-4', 'seed-6', 'seed-7', 'seed-9', 'seed-10')
ON CONFLICT (course_id, tee_name) DO NOTHING;
