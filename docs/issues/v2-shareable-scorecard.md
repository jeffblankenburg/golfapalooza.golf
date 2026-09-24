## Summary
A **Share button** on each round that hands the golfer a clean, shareable
**scorecard PNG of the whole round** — every player's scores together, because the
context of all the scores is the point. The golfer distributes it themselves via the
native **share sheet** (Messages, social, save to camera roll). Images are
**generated on demand, never persisted**.

**No auto-sending.** Nothing is texted when a round ends — sharing is always a
deliberate, user-initiated action. (So no Twilio/MMS, no completion hook, no
opt-out preference.)

## Infra already in place
- **`ImageResponse` (next/og)** already used (`/new/[slug]/icon`) — no new dependency.
- Web Share API is native to mobile browsers/PWAs.

## 1. The PNG route (one card, all players)
`GET /api/v2/rounds/[id]/card.png` → `ImageResponse`.
- One **group scorecard**: a row per player (holes across, scores down), par row,
  totals + to-par. **Every player on the round appears — including guests** (they
  played; that's the context).
- Optional `?highlight=<round_player_id>` to emphasize the sharer's row.
- **Putts as a small superscript** on a hole when tracked. Clean social look — no
  FIR/GIR/net clutter. Org branding/logo, course + tee + date.
- On-demand; not stored (`Cache-Control` so a re-share is cheap).
- **Auth-gated** — the client fetches it as the signed-in viewer (no Twilio means it
  needn't be public); scoped to someone who can see the round. UUID round id.
- Handles **18 / 9-hole / scramble**.
- *Layout note:* a full field × 18 holes is wide — likely a landscape card, or a
  front-9 / back-9 stacked split for 18-hole rounds, so it stays legible when
  shared. *Satori:* next/og is flexbox-only (no CSS grid) + needs an embedded font,
  so the table is built from flex rows.

## 2. Share button (My Rounds drawer + round detail)
A Share control on each round → fetch the group card (requester's row highlighted),
then invoke the **Web Share API** (`navigator.share({ files: [png] })`) so the
golfer drops it wherever they want. Desktop / unsupported → fall back to opening the
PNG (download / copy link).

## Guests
Shown ON the card (context), never texted or otherwise pushed anything.

## Open / decide during build
- Card visual design pass (landscape vs front/back split; highlighted-row treatment;
  superscript-putts styling).
- Where the Share button lives (My Rounds list row, round detail, or both).

## Acceptance
- Every round in My Rounds / round detail has a Share button that hands the golfer a
  freshly generated **group** scorecard PNG (all players incl. guests; their own row
  highlighted) via the native share sheet.
- Nothing is auto-sent on completion; no SMS/MMS anywhere.
- No scorecard images are stored.

Part of the My Rounds epic (#174).
