-- Backfill existing announcement activity-feed rows to the current format:
--   title    = the announcement headline (drops the old "posted an announcement")
--   subtitle = the first non-empty line of the body (truncated to 140 chars)
--
-- Announcement activity rows carry ref_id = the v2_announcements id, so we join
-- back to the source. Safe to re-run (it just re-sets the same values).

UPDATE public.v2_activity a
SET
  title = ann.title,
  subtitle = (
    SELECT CASE
             WHEN char_length(fl) > 140 THEN left(fl, 140) || '…'
             ELSE fl
           END
    FROM (
      -- first line of the body (everything before the first newline), trimmed
      SELECT NULLIF(btrim(split_part(coalesce(ann.body, ''), E'\n', 1)), '') AS fl
    ) s
  )
FROM public.v2_announcements ann
WHERE a.kind = 'announcement'
  AND a.ref_id = ann.id;
