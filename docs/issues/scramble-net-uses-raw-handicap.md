## Problem

In the admin Scramble manager (`ScrambleManager.tsx`) and the admin Scoring tool (`ScoringManager.tsx`), each team's **Net** and **vs Par** are computed from the *raw* `scramble_teams.team_handicap`. The public Scorecards page (`ScorecardsContent.tsx`) shifts every team's handicap down so the lowest-handicap team plays at 0, then displays Net using that adjusted value.

Result: an admin and a player look at the same team's Net and see different numbers. Relative leaderboard order is identical (the offset shifts every team equally), but absolute values diverge.

Today the admin scoring row shows: `Hdcp · Adj Hdcp · Gross · Net · vs Par` — so the offset value is visible, but Net/vs Par still use the raw HDCP next to it. This is mildly confusing on its own.

## Why it's deferred

We're waiting for the admin team (Jason Watson, etc.) to flag this in practice before we change scoring math behind their backs. Possible takes:

- "Yes, switch to adjusted everywhere" — players and admins see one number.
- "No, admins want the raw Net so they can see the actual stroke-play vs the course" — keep it as is, but maybe relabel.
- "Show both" — Net (raw) and Adj Net side by side.

## Files / lines

- `src/components/admin/ScrambleManager.tsx` — `calcNetScore`, `calcScoreVsPar` use `team.team_handicap`
- `src/components/admin/ScoringManager.tsx` — line ~861, `const net = tot !== null ? tot - team.team_handicap : null;`
- `src/components/ScorecardsContent.tsx` — lines 210–214 do the offset before display
- `src/app/api/admin/scramble/calculate-handicaps/route.ts` — produces the raw value stored in `scramble_teams.team_handicap`

## Acceptance criteria

Once we have an admin opinion:

1. Decide which value Net / vs Par should use in the admin tools.
2. Apply consistently in `ScrambleManager` and `ScoringManager`.
3. If keeping raw, update the small footer hint we already added in `ScoringManager` to call it out explicitly.
4. Verify the leaderboard / public scorecards still match player expectations.
