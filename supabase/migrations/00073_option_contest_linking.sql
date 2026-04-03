-- Add linked_contest_id to trip_options for auto-enrollment
-- For checkbox/select options, this links the whole option to a contest.
-- For multi_select options, contest linking is done per-choice in the choices JSONB
-- (each choice object can have an optional "contest_id" field).
ALTER TABLE public.trip_options ADD COLUMN IF NOT EXISTS linked_contest_id UUID REFERENCES public.contests(id) ON DELETE SET NULL;

-- Create contests for CTP, Long Drive, and 100 Feet (so they have contest_participants)
INSERT INTO public.contests (trip_id, name, contest_type, sort_order)
SELECT id, 'Closest to the Pin', 'other', 10 FROM public.trip_settings WHERE status = 'active';

INSERT INTO public.contests (trip_id, name, contest_type, sort_order)
SELECT id, 'Long Drive', 'other', 11 FROM public.trip_settings WHERE status = 'active';

INSERT INTO public.contests (trip_id, name, contest_type, sort_order)
SELECT id, '100 Feet!', 'other', 12 FROM public.trip_settings WHERE status = 'active';

-- Link Pick'em option to Pick'em contest
UPDATE public.trip_options SET linked_contest_id = 'bf99d202-88ce-41ac-bde4-0000ab242c9a'
WHERE id = '1b611294-e060-4305-9008-4eb0e5ebd239';

-- Link CTP option to CTP contest
UPDATE public.trip_options SET linked_contest_id = (
  SELECT id FROM public.contests WHERE name = 'Closest to the Pin' AND contest_type = 'other' LIMIT 1
) WHERE id = '20dbfd88-cfbf-46d3-b480-ccbf3741a804';

-- Link Long Drive option to Long Drive contest
UPDATE public.trip_options SET linked_contest_id = (
  SELECT id FROM public.contests WHERE name = 'Long Drive' AND contest_type = 'other' LIMIT 1
) WHERE id = '3fcedf12-47ea-4978-a3e9-8b23957e469d';

-- Link 100 Feet option to 100 Feet contest
UPDATE public.trip_options SET linked_contest_id = (
  SELECT id FROM public.contests WHERE name = '100 Feet!' AND contest_type = 'other' LIMIT 1
) WHERE id = 'ce68d65d-51c6-49d1-aad4-acecc9620bf6';

-- Link KGB Cup multi_select choice to KGB Cup contest (per-choice contest_id in JSONB)
UPDATE public.trip_options
SET choices = '[{"cost":65,"label":"KGB Cup on Wed","value":"kgb_cup_on_wed","contest_id":"5107c801-8a0f-4e34-8c83-1ecc0fed6d6f"},{"cost":10,"label":"Boland Bet on Wed","value":"boland_bet_on_wed"}]'::jsonb
WHERE id = '7fb20075-a0bd-4f9f-91f1-8486af98deb7';
