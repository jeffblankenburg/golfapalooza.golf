-- Seed the hybrid ("composition") tee mappings that 00210 missed. The original
-- library already had hybrid tees (e.g. "Blue/Black") whose per-hole source-tee
-- pointers live in composition_tee_mappings; 00210 copied courses/tees/holes but
-- not these, so those tees came across looking like plain tees with their own
-- (placeholder) hole data. This restores the pointers.
--
-- Id-preserving + idempotent. The referenced tee ids were preserved by 00210, so
-- the FKs to v2_course_tees resolve. Run after 00211 (creates the table).

INSERT INTO public.v2_composition_tee_mappings
  (id, tee_id, hole_number, source_tee_id, created_at)
SELECT
  id, tee_id, hole_number, source_tee_id, created_at
FROM public.composition_tee_mappings
ON CONFLICT (id) DO NOTHING;
