-- Rename kgb_cup contest type to ryder_cup for generic Ryder Cup format
UPDATE public.contests SET contest_type = 'ryder_cup' WHERE contest_type = 'kgb_cup';
