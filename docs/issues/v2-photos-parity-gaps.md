## Summary
Parity sweep of the shipped v2 Photos against v1's photo gallery. Core upload/view/react
is at parity; these v1 affordances were not carried over.

## Gaps
- **Caption + tag during upload.** v1 lets you caption and tag people at upload time; v2
  uploads with no caption/tag step.
- **Realtime reactions.** v1 reactions update live via subscription; v2 requires a
  refresh to see others' reactions land.
- **Reaction-detail view.** v1 lets you tap a reaction count to see *who* reacted; v2
  shows the count only.
- **Download button** on the full-size photo. v1 offers a direct download; v2 has no
  download affordance.
- **Keyboard navigation** in the lightbox (arrow keys between photos). v1 supports it;
  v2 is tap/swipe only.
- **Client-side image compression** before upload (same as chat — v1 downsizes; v2
  uploads raw).

Part of the Community epic (#172).
