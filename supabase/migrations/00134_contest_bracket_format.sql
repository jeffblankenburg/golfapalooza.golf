-- 00134_contest_bracket_format.sql
-- Adds bracket_format to contests for cornhole_doubles tournament style.
-- Singles is hardcoded to single-elimination with bo3 finals and ignores this column.
-- Allowed values:
--   'double-elimination'         (current doubles default — winners + losers + championship)
--   'single-elim-finals-bo3'     (single-elim, only the final is best-of-3)
--   'single-elim-all-bo3'        (single-elim, every match is best-of-3)
--   'single-elim-semis-bo3'      (single-elim, semifinals onward are best-of-3)

ALTER TABLE contests
  ADD COLUMN IF NOT EXISTS bracket_format text NOT NULL DEFAULT 'double-elimination';

ALTER TABLE contests
  DROP CONSTRAINT IF EXISTS contests_bracket_format_check;

ALTER TABLE contests
  ADD CONSTRAINT contests_bracket_format_check
  CHECK (
    bracket_format IN (
      'double-elimination',
      'single-elim-finals-bo3',
      'single-elim-all-bo3',
      'single-elim-semis-bo3'
    )
  );
