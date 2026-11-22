-- 00301_v2_profile_allergies.sql
-- Free-text allergies / sensitivities on a member profile (food, pets, smoke, etc.).
-- Editable by the member themselves and by org admins through the SAME shared
-- sanitizer (src/lib/v2/profile-write.ts). Surfaced when assigning lodging so an
-- admin can avoid putting an allergic member in a pet-friendly or smoking room.
--
-- Column add only; v2_profiles already carries the standard table grants, which
-- apply to every column, so no new GRANT is needed.

ALTER TABLE public.v2_profiles ADD COLUMN IF NOT EXISTS allergies TEXT;
