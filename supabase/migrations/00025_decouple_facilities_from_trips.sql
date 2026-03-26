-- Decouple facilities and rooms from trips.
-- Facilities/rooms are physical things that exist independently.
-- Events choose which facilities to use via trip_facilities join table.
-- Room assignments are per-event.

-- 1. Create trip_facilities join table
CREATE TABLE IF NOT EXISTS public.trip_facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_id, facility_id)
);

ALTER TABLE public.trip_facilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read trip_facilities" ON public.trip_facilities;
CREATE POLICY "Authenticated users can read trip_facilities"
  ON public.trip_facilities FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage trip_facilities" ON public.trip_facilities;
CREATE POLICY "Admins can manage trip_facilities"
  ON public.trip_facilities FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- 2. Migrate existing facility-trip relationships to trip_facilities
INSERT INTO public.trip_facilities (trip_id, facility_id)
SELECT trip_id, id FROM public.facilities WHERE trip_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Add trip_id to room_assignments (per-event assignments)
ALTER TABLE public.room_assignments
  ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES public.trip_settings(id) ON DELETE CASCADE;

-- Backfill room_assignments.trip_id from rooms.trip_id
UPDATE public.room_assignments ra
SET trip_id = r.trip_id
FROM public.rooms r
WHERE ra.room_id = r.id AND ra.trip_id IS NULL AND r.trip_id IS NOT NULL;

-- 4. Drop trip_id from facilities
ALTER TABLE public.facilities DROP CONSTRAINT IF EXISTS facilities_trip_id_name_key;
ALTER TABLE public.facilities DROP COLUMN IF EXISTS trip_id;
ALTER TABLE public.facilities ADD CONSTRAINT facilities_name_key UNIQUE (name);

-- 5. Drop trip_id from rooms
ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_trip_id_room_number_key;
ALTER TABLE public.rooms DROP COLUMN IF EXISTS trip_id;

-- Add unique constraint scoped to facility
ALTER TABLE public.rooms ADD CONSTRAINT rooms_facility_id_room_number_key UNIQUE (facility_id, room_number);

-- 6. Update room_assignments unique constraint to include trip_id
ALTER TABLE public.room_assignments DROP CONSTRAINT IF EXISTS room_assignments_room_id_user_id_key;
ALTER TABLE public.room_assignments ADD CONSTRAINT room_assignments_trip_room_user_key UNIQUE (trip_id, room_id, user_id);
