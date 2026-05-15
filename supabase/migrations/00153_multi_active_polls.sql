-- Allow multiple active polls at the same time. Originally a partial unique
-- index enforced one-active-poll because the home page only showed one CTA;
-- now the home page stacks up to 3 fuchsia banners and we want admins to be
-- able to run concurrent polls (e.g. an event-wide topic + a custom-audience
-- nomination at the same time). The vote-per-user invariant is unaffected
-- (still enforced on poll_responses(poll_id, user_id)).

DROP INDEX IF EXISTS idx_polls_one_active;
