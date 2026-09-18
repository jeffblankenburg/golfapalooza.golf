Part of #174 (v2 My Rounds epic).

## Overview
Expand round `format` beyond `individual` / `scramble`. Key rule: **only individual stroke play posts to a handicap** — every team format is handicap-EXCLUDED, exactly as `scramble` is treated today.

## Formats to add
- **Shamble** — best drive, then each plays their own ball in. Scorecard shows per-player scores (looks like individual) but is still handicap-excluded (free drive).
- **Best ball / Four-ball** — each plays their own ball; the team takes the best score per hole.
- **Alternate shot / Foursomes** — partners share one ball, alternating.

## Technical
- Extend the `v2_rounds.format` CHECK enum + the format segmented toggle in the wizard's Details step.
- Handicap exclusion already keys off `format !== 'individual'` in the gather query / `recalc.ts` / `handicap.ts` — verify each new value is excluded end-to-end.
- Scorecard nuance per format: shamble = per-player scores, no differential; best-ball / alternate-shot = team scoring (single row, like scramble).

## Acceptance
- New formats selectable in the wizard.
- None post to a handicap except `individual`.
- Scorecards render sensibly for each format (per-player vs team).
