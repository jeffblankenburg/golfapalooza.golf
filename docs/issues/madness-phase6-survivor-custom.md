Part of #223 (epic). Two lighter additions once the engine exists.

## Survivor / elimination
- New `contest_type`; track **alive / eliminated** state per user; a weekly/round pick; wrong pick eliminates you (or last-alive wins). Grading via Phase 2.
- **Open decision:** payout model — winner-take-all vs split-among-alive (extend `payout_splits` with an `alive_split` kind).

## Custom user-made brackets
- Self-serve single / double-elimination tournaments among members (not ESPN-graded; manual match advancement), ported from bromadness `custom_bracket_*`. Double-elim needs the winners/losers/grand-final-reset advancement logic.
- Independent of sports data — pure bracket bookkeeping; reuses the bracket engine from Phase 3.

**Dependencies:** Phase 3 (bracket engine) for custom brackets; Phase 1/2 for survivor. **Reference:** bromadness `custom_bracket_*`, `custom_bracket_matches`, `game_rules`.
