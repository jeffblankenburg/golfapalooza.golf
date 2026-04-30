## Problem

Plain text-styled clickable elements ("text links") are scattered throughout the app. They're hard to spot as interactive, easy to miss-tap on mobile, and inconsistent — sometimes green, sometimes gray, sometimes underlined, sometimes not. We want every clickable text element converted to a **subtle button** with a recognizable shape, padding, and pressable feedback.

This is **not** about prettifying user-facing markdown content — links inside articles, bios, chat messages, and notebook entries should remain underlined inline links. It's about the chrome of the app: action affordances, navigation, "Edit / Reset / Cancel / Done" controls, etc.

## Proposed visual scheme (single source of truth)

Pick one Tailwind preset per intent and apply consistently:

| Intent | Tailwind class | When to use |
|---|---|---|
| Neutral / dismiss | `px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 active:bg-gray-200 transition-colors` | "Done", "Close", "Cancel", "Skip", "Reset" |
| Primary inline action | `px-3 py-1.5 rounded-lg text-sm font-medium bg-green-50 text-green-700 active:bg-green-100 transition-colors` | "Edit", "+ Add Tee", "Add your first round →", mode-switch toggles |
| Destructive | `px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-600 active:bg-red-100 transition-colors` | "Delete", "Remove", "Clear all" |
| Back / step nav | `inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-medium text-gray-600 bg-gray-50 active:bg-gray-100 transition-colors` (with chevron icon) | "← Home", "← Courses", step "← Back" |

(These are starting proposals — happy to iterate on the visual weight before bulk-applying.)

## Already converted (reference)

- `src/components/BestLineContent.tsx:144` — "Done" → neutral pill (commit a1b2c3 — placeholder)

## Catalog (initial sweep — INCOMPLETE; see "Sweep TODO" below)

### Authenticated pages — `src/app/(app)/**`

| File:Line | Label | Category |
|---|---|---|
| my-rounds/courses/new/page.tsx:7 | ← Courses | back-nav |
| my-rounds/courses/[id]/page.tsx:76 | ← Courses | back-nav |
| my-rounds/courses/[id]/page.tsx:117 | Edit | primary inline |
| my-rounds/courses/page.tsx:20 | ← My Rounds | back-nav |
| my-rounds/courses/page.tsx:53 | Add your first course → | primary inline |
| my-rounds/rounds/new/page.tsx:7 | ← My Rounds | back-nav |
| my-rounds/rounds/[id]/page.tsx:142 | ← My Rounds | back-nav |
| my-rounds/rounds/[id]/page.tsx:296 | Delete Round | destructive |
| my-rounds/page.tsx:114 | Add your first round → | primary inline |
| loozers/[userId]/page.tsx:22 | ← Loozers | back-nav |

### My Rounds shared components — `src/components/my-rounds/**`

| File:Line | Label | Category |
|---|---|---|
| TeeList.tsx:68 | + Add Tee | primary inline |
| TeeList.tsx:101 | Edit (× N rows) | primary inline |
| TeeList.tsx:108 | Hide Holes / Holes | secondary inline |
| TeeForm.tsx:174 | Show/Hide 9-hole ratings | secondary inline |
| RoundForm.tsx:502 | ← Back (step) | step-nav |
| RoundForm.tsx:589 | Search by name instead → | secondary inline (mode switch) |
| RoundForm.tsx:618 | Don't see your course? Add it → | primary inline |
| RoundForm.tsx:968 | ← Back | step-nav |
| CourseLookupModal.tsx:272 | × close | secondary inline |

### Admin pages — `src/components/admin/**`

| File:Line | Label | Category |
|---|---|---|
| UnverifiedCoursesQueue.tsx:77 | ← All courses | back-nav |
| UnverifiedCoursesQueue.tsx:95 | [Course name] | link-out |
| ArticleManager.tsx:177 | Reset | secondary inline |
| BioManager.tsx:134 | Reset | secondary inline |
| FakeAdManager.tsx:217 | Reset | secondary inline |
| RichTextEditor.tsx:182 | Cancel | secondary inline |
| RyderCupManager.tsx:596 | Dismiss error | secondary inline |
| RyderCupManager.tsx:1008 | Cancel | secondary inline |
| ContestManager.tsx:226 | [Contest name] (clickable row) | link-out |
| WinnersManager.tsx:206 | Dismiss error | destructive |

### Public / spectator — `src/app/(public)/**`

| File:Line | Label | Category |
|---|---|---|
| spectator/loozers/[userId]/page.tsx:113 | ← Loozers | back-nav |

### Other shared components — `src/components/**`

| File:Line | Label | Category |
|---|---|---|
| articles/ArticleDetail.tsx:34 | ← Articles | back-nav |
| chat/GifPicker.tsx:106 | Clear query | secondary inline |
| chat/ChatRoomSettings.tsx:171 | Add / Done | secondary inline |
| gallery/MediaComments.tsx:140 | Close | secondary inline |
| LoozerProfile.tsx:248 | Sponsor link | link-out |
| LoozerProfile.tsx:396 | See All Photos | primary inline |
| NotificationDrawer.tsx:216 | Clear all | destructive |
| BspitwContent.tsx:207–217 | Sortable column headers | (re-evaluate — column headers, not links) |

## Sweep TODO

The catalog above came from one Explore pass; a follow-up grep showed many more matches in:
- `src/app/(admin)/admin/events/[tripId]/**` — every sub-page (calcutta, brackets, contests, options, financials, daily-winners, polls, courses, articles, fake-ads, nominations, users, sponsorship)
- `src/components/admin/{BspitwPlayoff, BracketManager, CalcuttaManager, DailyWinnersManager, ContestSetup, ContestParticipants, TeeTimeManager, ScrambleManager, ScoringManager, SelectionDashboard, …}`
- `src/components/scoring/{LiveScorer, KgbCupLiveScorer, ScoringShell}`
- `src/components/{calcutta, brackets, polls, kgb-cup, course}` directories

Before bulk-converting, do a complete grep using:
```
ripgrep '<(Link|button|a)\\b[^>]*\\bclassName="[^"]*\\btext-(green|red|blue|indigo|amber|gray)-[567]00[^"]*"' --type tsx
```
and reject matches containing `bg-`, `rounded-full`, or `border ` to filter out things that are already buttons.

## Acceptance criteria

- [ ] Complete the sweep — final catalog committed alongside the change.
- [ ] Agree on the four-class scheme above (or revised).
- [ ] Convert all confirmed text links per category.
- [ ] Markdown-rendered links (`prose` className context) remain inline-styled.
- [ ] No regressions in keyboard focus, navigation, or accessibility (each subtle button still uses `<Link>` for navigation, `<button>` for actions — visual change only).
- [ ] Visual review: open every page touched, verify the new buttons look intentional and consistent.

## Out of scope

- Restyling `BottomDrawer` close buttons (already icon buttons).
- Tab strips / segmented controls — these are tabs, not text links.
- Pagination clusters if any exist.
- Markdown link rendering inside articles, bios, chat messages, notebook entries.
