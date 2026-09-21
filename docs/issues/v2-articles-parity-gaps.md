## Summary
Parity sweep of the shipped v2 Articles reader against v1's articles system. The reader
+ landing page are shipped; **authoring/editing admin is already tracked in #164**. This
issue enumerates the remaining v1 article capabilities not carried over, so they aren't
silently dropped. Several belong under the #164 authoring build — cross-referenced below.

## Gaps (reader / platform)
- **Video embeds** in article bodies. v1 renders embedded video; v2 body rendering does
  not.
- **Pinned / featured article** ("notebook") — v1 can pin an article to the top of the
  list and on the home page; v2 always shows latest-first with no pin.
- **View tracking / analytics.** v1 records article views (read counts); v2 has none.
- **Gallery + song-art as article image sources.** v1 can pull an article's hero/inline
  images from the photo gallery and from song artwork; v2 only supports direct upload.
- **Notify-on-publish + cron.** v1 fires a notification when an article publishes and has
  a scheduled-publish cron. v2 has neither (no `article` notification type, no schedule).
- **Spectator article routes.** v1 exposes articles on the public spectator surface; v2's
  spectator surface doesn't include the full article reader.
- **Client-side image compression** on article image upload (same pattern as chat/photos).
- **Storage cleanup** — v1 removes orphaned article images when an article/image is
  deleted; v2 leaves them.

## Belongs under #164 (authoring/editing admin)
- **Author picker** (attribute an article to a member other than the poster).
- **Admin list pagination** for the article manager.

Part of the Stories & Recognition epic (#173). Authoring/editing admin = #164.
