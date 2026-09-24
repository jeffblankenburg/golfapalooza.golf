-- v2 rounds: "silent" flag for quiet, hole-by-hole past-round entry.
--
-- The score entry UI is identical for "Live scoring" and "Score hole-by-hole" —
-- the only difference is DURING-round broadcasting. A silent round is a back-fill
-- of a round already played, so while it's being entered it must NOT announce
-- itself as live: no "LIVE now" activity entry, and (when the follow-a-golfer push
-- ships, #187) no "teed off" and no per-hole pushes — nobody is playing right now.
--
-- On COMPLETION it behaves like any round: it posts its scores to the org-wide
-- activity feed AND fires the "finished a round / entered a scorecard" push to the
-- golfer's followers. That completion push fires for EVERY entry mode (silent
-- hole-by-hole, live, or quick total) — `silent` only gates the during-round
-- broadcasting, never the finished notification.
--
-- The feed shows EVERY round from every player (18, 9-hole, and scramble) and is
-- org-wide; the push notifications (#187) are follower-scoped.
--
-- Default false: existing rounds were live-scored, so they keep broadcasting.

ALTER TABLE public.v2_rounds
  ADD COLUMN IF NOT EXISTS silent BOOLEAN NOT NULL DEFAULT false;
