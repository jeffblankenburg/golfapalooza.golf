-- Dedicated table for Loozer biographies (not trip-scoped)
DROP TABLE IF EXISTS public.loozer_bios;

CREATE TABLE public.loozer_bios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.loozer_bios ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all bios
CREATE POLICY "loozer_bios_select"
  ON public.loozer_bios FOR SELECT TO authenticated USING (true);

-- Only admins (via service role) can insert/update/delete
