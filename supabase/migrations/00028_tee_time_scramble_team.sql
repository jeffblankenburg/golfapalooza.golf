-- Link tee times to scramble teams for scramble days (1:1 mapping)
ALTER TABLE public.tee_times ADD COLUMN scramble_team_id UUID REFERENCES public.scramble_teams(id) ON DELETE SET NULL;
CREATE INDEX idx_tee_times_scramble_team ON public.tee_times(scramble_team_id);
