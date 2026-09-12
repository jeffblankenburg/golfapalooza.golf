-- v2 Courses — a UNIVERSAL course library shared by every group (no org_id).
-- Any signed-in v2 user can add/edit/update any course (mirrors the original's
-- co-equal editing, issue #133, but universal). Mirrors the original courses /
-- course_tees / course_holes tables (00002 + 00020/00080/00081/00092/00093/
-- 00112/00113/00116/00157) MINUS per-course locking (universal edit) and the
-- users-table FKs (attribution points at v2_profiles). Seeded from the originals
-- in 00210.

DROP TABLE IF EXISTS public.v2_course_holes;
DROP TABLE IF EXISTS public.v2_course_tees;
DROP TABLE IF EXISTS public.v2_courses;

CREATE TABLE public.v2_courses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id  VARCHAR(100) UNIQUE,                 -- gcapi id when source='gcapi'
  name         VARCHAR(200) NOT NULL,
  club_name    VARCHAR(200),
  address      VARCHAR(300),
  city         VARCHAR(100),
  state        VARCHAR(50),
  country      VARCHAR(100) DEFAULT 'USA',
  postal_code  VARCHAR(20),
  phone        VARCHAR(30),
  website      VARCHAR(300),
  latitude     DECIMAL(10, 7),
  longitude    DECIMAL(10, 7),
  hole_count   INTEGER DEFAULT 18 CHECK (hole_count IN (9, 18)),
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'gcapi', 'ai')),
  verified     BOOLEAN NOT NULL DEFAULT false,      -- manual = auto-verified; AI/GCAPI drafts need review
  verified_by  UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  verified_at  TIMESTAMPTZ,
  lookup_key   TEXT,                                -- normalized name|state|city dedup key
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  created_by   UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  updated_by   UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX idx_v2_courses_lookup_key
  ON public.v2_courses (lookup_key) WHERE lookup_key IS NOT NULL;

CREATE TABLE public.v2_course_tees (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id          UUID NOT NULL REFERENCES public.v2_courses(id) ON DELETE CASCADE,
  tee_name           VARCHAR(50) NOT NULL,
  tee_color          VARCHAR(20),
  gender             VARCHAR(10) DEFAULT 'all' CHECK (gender IN ('men', 'women', 'all')),
  course_rating      DECIMAL(4, 1),                 -- nullable (00080)
  slope_rating       INTEGER CHECK (slope_rating BETWEEN 55 AND 155),
  front_nine_rating  DECIMAL(4, 1),
  front_nine_slope   INTEGER CHECK (front_nine_slope BETWEEN 55 AND 155),
  back_nine_rating   DECIMAL(4, 1),
  back_nine_slope    INTEGER CHECK (back_nine_slope BETWEEN 55 AND 155),
  total_yards        INTEGER,
  total_meters       INTEGER,
  par                INTEGER NOT NULL DEFAULT 72,
  confidence         JSONB,                         -- AI extraction confidence per field
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (course_id, tee_name)
);
CREATE INDEX idx_v2_course_tees_course ON public.v2_course_tees (course_id);

CREATE TABLE public.v2_course_holes (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id              UUID NOT NULL REFERENCES public.v2_courses(id) ON DELETE CASCADE,
  tee_id                 UUID NOT NULL REFERENCES public.v2_course_tees(id) ON DELETE CASCADE,
  hole_number            INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  par                    INTEGER NOT NULL CHECK (par BETWEEN 3 AND 6),
  handicap_index         INTEGER NOT NULL CHECK (handicap_index BETWEEN 1 AND 18),
  yards                  INTEGER,
  meters                 INTEGER,
  hole_name              TEXT,                       -- per-hole nickname, mirrored across tees
  overhead_image_url     TEXT,
  green_image_url        TEXT,
  tee_latitude           DECIMAL(10, 7),
  tee_longitude          DECIMAL(10, 7),
  green_latitude         DECIMAL(10, 7),
  green_longitude        DECIMAL(10, 7),
  green_front_latitude   DOUBLE PRECISION,
  green_front_longitude  DOUBLE PRECISION,
  green_back_latitude    DOUBLE PRECISION,
  green_back_longitude   DOUBLE PRECISION,
  drive_latitude         DOUBLE PRECISION,
  drive_longitude        DOUBLE PRECISION,
  center_line            JSONB,                      -- ordered [lat,lng] corridor polyline
  created_at             TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tee_id, hole_number)
);
CREATE INDEX idx_v2_course_holes_course ON public.v2_course_holes (course_id);
CREATE INDEX idx_v2_course_holes_tee ON public.v2_course_holes (tee_id);

-- Universal library: any authenticated user reads and writes. No org scoping,
-- no per-course locking.
ALTER TABLE public.v2_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_course_tees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_course_holes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_courses_all" ON public.v2_courses FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_course_tees_all" ON public.v2_course_tees FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_course_holes_all" ON public.v2_course_holes FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_courses TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_course_tees TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_course_holes TO authenticated, service_role;
