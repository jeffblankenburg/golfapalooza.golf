## Summary
v2's handicap engine only ingests **completed, 18-hole, individual** rounds — the
gathering query in `src/lib/v2/golf/handicap.ts` hard-filters `round_type = "18"`,
and the round-completion math skips 9-hole rounds. WHS **does** support 9-hole
rounds, so Front 9 / Back 9 rounds should be able to count.

The round-creation form currently tells users "Nine-hole rounds don't count toward
your handicap" — accurate to today's behavior, but it should change once this ships.

## WHS 9-hole method (2020+)
1. Compute a **9-hole Score Differential** from the 9-hole adjusted gross, the
   **9-hole course rating**, and the **9-hole slope** for the specific nine played:
   `9-hole diff = (113 / nine_slope) × (nine_AGS − nine_rating)`.
2. Combine it with an **expected Score Differential for the missing 9 holes**
   (a WHS table keyed on the player's current Handicap Index) to produce an
   **18-hole-equivalent Score Differential**, which enters the 20-round record
   normally (best 8 of 20, low-index cap, etc. all unchanged).

## We already have the data
`v2_course_tees` stores `front_nine_rating`, `front_nine_slope`,
`back_nine_rating`, `back_nine_slope`. So this is **schema-ready** — it's purely
unimplemented. Pick the front/back set based on `round_type` (`9-front`/`9-back`).

## Implementation sketch
- Round completion (`/api/v2/rounds/[id]/complete` + `recalc`): for a 9-hole
  round, compute the 9-hole differential from the matching nine's rating/slope,
  convert to an 18-hole equivalent via the WHS expected-differential table (uses
  the player's current index), and store on `v2_round_players.score_differential`.
- `handicap.ts`: drop the `round_type = "18"` filter; include any completed
  individual round with a non-null differential.
- UI: update the form hint + any "doesn't count" copy; label 9-hole rounds in the
  history as handicap-eligible.

## The "just halve the 18-hole values" question
- **Rating — halving is a rough approximation.** 18-hole rating ≈ front-9 +
  back-9, so `rating / 2` is close, but the two nines usually differ in
  difficulty, so it's imperfect. Acceptable only as a **fallback** when the real
  per-nine rating is missing.
- **Slope — do NOT halve.** Slope is a 55–155 difficulty index, not a stroke
  count; a 9-hole slope is on the same scale (~113-ish). Halving it is meaningless.
  Fallback when missing: reuse the 18-hole slope, don't halve.

Recommended: use the stored per-nine rating/slope when present; fall back to
`rating/2` + full 18-hole slope only when the per-nine values are null (and flag
that the result is approximate).

## Caveats
- **Coverage:** the per-nine rating/slope columns are nullable and often empty on
  imported / AI-looked-up courses. Where absent (and without the fallback), a
  9-hole round still can't count — surface *why* in the form/round detail.
- **Recompute ordering:** the "expected" piece depends on the player's
  index-at-the-time; WHS defines this via a fixed table, so it's deterministic but
  adds a step.

## Acceptance
- A completed 9-hole individual round produces a valid 18-hole-equivalent
  differential and affects the player's Handicap Index per WHS.
- Courses missing 9-hole ratings either use the documented fallback or clearly
  explain why the round didn't count. Form/help copy updated.

Part of the My Rounds epic (#174).
