# Feature: Notebook

## Overview
A Notebook for sharing rules, event details, and general info with players — similar to the old app at golf.poststats.com/c/notes. Admin creates categories and notes; players browse them on a mobile-first page. Notes can be "pinned" to specific contest pages and accessed via an info button.

## Reference
Old app: https://golf.poststats.com/c/notes?eventID=90&noteID=896

Categories from the old app:
- **General**: Hotel Amenities, Hotel Lodging, Parking, Meals, Things to Remember to Pack
- **Event Rules**: KGB Cup, Boland Bet, Calcutta Auction, Cornhole, Whitey's CFB Pool
- **Golf Rules**: BSPITW, Bonus Points, Scramble Team Selections, Scorecards, Tee Boxes, On Course Contests

## Requirements

### Content & Formatting
- Markdown support for bold, italic, lists, numbered lists, sub-bullets
- **Line breaks must be respected** — single Enter = new line. Non-technical admins won't understand why pressing Enter doesn't work. Use `remark-breaks` plugin.
- Underline support via `<u>text</u>` (using `rehype-raw`)
- Hyperlinks to external websites and internal app pages (internal links use Next.js `<Link>`)

### Database
Two tables tied to a trip:
- **`notebook_categories`**: id, trip_id, name, sort_order
- **`notebook_notes`**: id, trip_id, category_id, title, content (markdown), sort_order, pinned_to (nullable slug like "kgb_cup", "scramble", etc.), created_at, updated_at
- Unique partial index on `(trip_id, pinned_to) WHERE pinned_to IS NOT NULL`
- RLS: authenticated can read, admins can manage

### Admin UI
- NotebookManager component in the event admin page (CollapsibleSection)
- Category CRUD: inline list with add/edit/delete
- Note CRUD: title, category dropdown, markdown textarea with Edit/Preview toggle, pinned_to dropdown, sort order
- Delete confirmations via ConfirmModal

### Player-Facing Page (`/notebook`)
- Mobile-first layout
- Horizontal scrollable category tabs (pill buttons)
- Note titles as tappable cards under selected category
- Tapping expands note inline (accordion) showing rendered markdown
- Accessible from home page quick links (always visible, no contest requirement)

### Pinned Notes ("circle i" info button)
- Reusable `PinnedNoteButton` component
- Renders a small info circle icon on contest pages
- On tap: fetches the pinned note for that slug, opens a modal with rendered content
- Add to: KGB Cup, Scrambles/Scorecards, BSPITW, Skins, 100 Feet, Calcutta, Cornhole, Pick'em pages

## Technical Plan

### Dependencies to Install
```
npm install remark-breaks rehype-raw
```
(`react-markdown` is already installed)

### New Files
1. `supabase/migrations/00070_notebook.sql`
2. `src/app/api/admin/notebook/categories/route.ts` — Admin CRUD
3. `src/app/api/admin/notebook/notes/route.ts` — Admin CRUD
4. `src/app/api/notebook/route.ts` — Player-facing read API (supports `pinned_to` query param)
5. `src/components/admin/NotebookManager.tsx`
6. `src/app/(app)/notebook/page.tsx` — Server component
7. `src/components/notebook/NotebookContent.tsx` — Client component
8. `src/components/notebook/PinnedNoteButton.tsx`

### Files to Modify
9. `src/app/(admin)/admin/events/[tripId]/page.tsx` — Add NotebookManager CollapsibleSection
10. `src/components/HomeContent.tsx` — Add Notebook to `allQuickLinks`
11. Contest pages (KGB Cup, Scorecards, BSPITW, Skins, etc.) — Add PinnedNoteButton

### Implementation Order
1. Migration + npm install
2. Admin API routes (categories + notes)
3. NotebookManager component + wire into admin event page
4. Player API route
5. NotebookContent + notebook page
6. Home page quick link
7. PinnedNoteButton component
8. Add info buttons to contest pages

## Acceptance Criteria
- [ ] Admin can create/edit/delete categories and notes
- [ ] Notes support markdown with line breaks, bold, italic, underline, links, lists
- [ ] Player notebook page shows categories as tabs, notes expand inline
- [ ] Pinned notes appear as info buttons on contest pages
- [ ] Internal links navigate within the app, external links open in new tab
- [ ] Single Enter key creates a visible line break (non-technical-friendly)
- [ ] Deleting a category cascades to delete its notes
