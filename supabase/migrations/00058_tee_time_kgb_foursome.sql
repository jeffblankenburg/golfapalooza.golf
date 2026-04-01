-- Add kgb_foursome_id to tee_times so tee sheet players can be derived from live foursome/pair data
ALTER TABLE tee_times ADD COLUMN IF NOT EXISTS kgb_foursome_id UUID REFERENCES ryder_cup_foursomes(id) ON DELETE SET NULL;
