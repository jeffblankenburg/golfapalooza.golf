## Summary
Unify the chat and round-comment composers onto the single shared `MessageComposer` component, so there's one implementation of mentions / photo upload / GIF search / emoji instead of two.

## Background / current state
- Round comments now use a **new reusable** `src/app/new/_components/MessageComposer.tsx` (+ `.module.css`) — @mention autocomplete (`@[Name](id)` wire format), photo staging→upload, Giphy search, emoji, and a single **+** attach menu (Camera / Photos / GIFs / Emoji). It supports `menuPlacement="above" | "below"`.
- **Chat (`ChatDrawer.tsx`, ~1,454 lines) still uses its own inline composer.** The shared one was deliberately NOT extracted from chat this pass to avoid regressing a large, working file.
- The two composers are now near-duplicates (mentions, upload, giphy, emoji, staged image).

## Goal
Refactor `ChatDrawer` to consume `MessageComposer` (menu **above** for chat), deleting its duplicated composer logic. Keep chat-only features working — reply-to, typing indicator, image-only sends, room-scoped upload endpoint — either by extending `MessageComposer`'s props (e.g. optional reply slot, `onTyping`, custom `uploadImage`) or by composing around it.

## Scope / considerations
- Parameterize upload: chat uploads to `/api/v2/chat/rooms/[roomId]/upload`; comments to `/api/v2/rounds/[id]/comments/upload`. The composer already emits `{content, imageFile, gifUrl}` and lets the parent fulfill it — extend that contract as needed.
- Preserve chat's reply bar + typing signal (composer doesn't have these yet).
- Verify chat regressions carefully (send, mentions, images, GIFs, emoji, reply, drafts, autogrow) — hard to catch without manual testing.
- Net result: one composer, two callers (chat = menu above, comments = menu below).

## Notes
Requested explicitly: "merge the codebases for chat and comments." Part of the My Rounds epic (#174) / Community epic (#172).
