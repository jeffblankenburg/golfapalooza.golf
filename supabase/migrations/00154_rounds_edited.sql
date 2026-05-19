-- Editable scorecards. After a round is completed, the scorer (or an
-- admin) can correct a score they entered incorrectly. We record when the
-- last edit happened and who made it so the UI can show an "Edited" badge.
-- Per-hole audit isn't needed for v1; the live round_scores rows are the
-- authoritative current state and forensics can fall back on activity_log.

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_by UUID REFERENCES users(id) ON DELETE SET NULL;
