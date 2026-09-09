-- Fix v2_profiles rows whose display_name is still a raw phone-number placeholder
-- (set at self-provision before a name was known). These predate the 00186 ETL,
-- so the ETL's non-destructive DO UPDATE left them untouched. Replace with the
-- proper shown name: nickname, else "First Last", else leave the placeholder.

UPDATE public.v2_profiles
SET display_name = COALESCE(
      NULLIF(TRIM(nickname), ''),
      NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''),
      display_name
    ),
    updated_at = now()
WHERE display_name ~ '^\+?[0-9]{7,}$';
