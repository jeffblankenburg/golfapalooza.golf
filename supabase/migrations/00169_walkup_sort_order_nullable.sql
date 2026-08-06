-- Walk-up order fix: sort_order is now NULLABLE.
-- NULL means "this player has not been manually dragged into a position" — the
-- API falls back to the computed group order (tee-time groups, else scramble
-- teams). Previously sort_order was NOT NULL DEFAULT 0, and because a song/start
-- edit upserts every visible row, editing anything silently pinned the WHOLE
-- list's order. Making it nullable lets metadata edits leave order untouched.

ALTER TABLE public.walkup_entries ALTER COLUMN sort_order DROP NOT NULL;
ALTER TABLE public.walkup_entries ALTER COLUMN sort_order DROP DEFAULT;

-- Reset the unintended auto-pins so the group ordering takes over. Safe: these
-- were written by the bug above, not by a deliberate reorder.
UPDATE public.walkup_entries SET sort_order = NULL;
