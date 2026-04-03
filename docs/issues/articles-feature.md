# Feature: Articles

## Overview
A publishing system for event-related articles/announcements. Admin writes, saves drafts, schedules, and publishes articles. Players see a feed of published articles. Similar formatting to the Notebook feature — markdown with line breaks, basic markup, URLs. Featured images are selected from the app's existing photo gallery.

## Reference
Old app: https://golf.poststats.com/c/articles?eventID=90

Old app shows:
- Article list: date + clickable title, reverse chronological
- Article detail: headline, date, featured image, body with paragraphs, numbered lists, bullets

## Requirements

### Content & Formatting
- Same markdown approach as Notebook: `react-markdown` + `remark-breaks` + `rehype-raw`
- Line breaks respected by default (single Enter = new line)
- Bold, italic, underline (`<u>`), links, numbered/bulleted lists
- Internal app links use Next.js `<Link>`, external links open in new tab

### Featured Image
- Select from existing `gallery_items` table (no new upload flow needed)
- Admin picks a photo from the gallery via a picker UI
- Article stores `featured_image_id` FK → `gallery_items(id)`
- Display `media_url` or `thumbnail_url` from the linked gallery item

### Article Lifecycle
- **Draft**: saved but not visible to players
- **Scheduled**: has a `publish_at` date in the future, auto-visible when that date arrives
- **Published**: `publish_at` is set and in the past (or null with `published` = true)
- Simple status: if `publish_at IS NULL` → draft. If `publish_at <= NOW()` → published. If `publish_at > NOW()` → scheduled.

## Database

**Migration:** `supabase/migrations/00071_articles.sql`

### `articles`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| trip_id | UUID FK → trip_settings | CASCADE DELETE |
| author_id | UUID FK → users | ON DELETE SET NULL |
| title | VARCHAR(300) | NOT NULL |
| content | TEXT | NOT NULL DEFAULT '' |
| featured_image_id | UUID FK → gallery_items | ON DELETE SET NULL, nullable |
| publish_at | TIMESTAMPTZ | nullable — NULL = draft, set = scheduled/published |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |

- Index on `(trip_id, publish_at)` for efficient feed queries
- RLS: authenticated can SELECT where `publish_at <= NOW()` (only published articles); admins can ALL
- Updated_at trigger

## API Routes

### Admin
**`src/app/api/admin/articles/route.ts`** — GET/POST/PUT/DELETE
- GET: all articles for a trip (drafts + scheduled + published), ordered by `created_at DESC`
- POST: create article `{ trip_id, title, content, featured_image_id, publish_at }`
- PUT: update article `{ id, title, content, featured_image_id, publish_at }`
- DELETE: delete article `{ id }`

### Player-facing
**`src/app/api/articles/route.ts`** — GET only
- Query params: `trip_id` (optional, falls back to active trip), `limit`, `cursor`
- Returns only published articles (`publish_at <= NOW()`), newest first
- Joins `featured_image:gallery_items(id, media_url, thumbnail_url)` and `author:users(display_name, avatar_url)`

## Admin UI

### `src/components/admin/ArticleManager.tsx`
A standalone admin module (not nested inside event detail — its own page).

**Admin page:** `src/app/(admin)/admin/articles/page.tsx`
- Permission gated (admin only)
- Lists all articles with status badges (Draft, Scheduled with date, Published)
- Each row: title, status badge, date, edit/delete buttons
- "New Article" button

**Article editor (inline or separate view):**
- Title input
- Markdown textarea with Edit/Preview toggle
- Gallery image picker: button that opens a modal/drawer showing recent gallery photos as a grid, tap to select. Shows selected image thumbnail.
- Publish controls:
  - "Save as Draft" button (sets `publish_at = null`)
  - "Schedule" with datetime picker (sets `publish_at` to future date)
  - "Publish Now" button (sets `publish_at = NOW()`)
- Delete with ConfirmModal

### Gallery Image Picker
**`src/components/admin/GalleryImagePicker.tsx`**
- Modal that fetches photos from `/api/gallery?media_type=photo&limit=30`
- Grid of thumbnails, tap to select
- Shows selected state with a checkmark overlay
- Returns the selected `gallery_item.id`

### Admin navigation
- Add "Articles" link to admin sidebar/nav (wherever other admin links like Gallery, Music, Announcements live)

## Player-Facing Page

### `src/app/(app)/articles/page.tsx` (server component)
- Fetch published articles for active trip
- Pass to client component

### `src/components/articles/ArticleList.tsx` (client component)
- Card-based feed, newest first
- Each card: featured image (if set, full-width at top), title, date, first ~150 chars of content as preview
- Tap card → navigates to article detail

### `src/app/(app)/articles/[articleId]/page.tsx` (server component)
- Fetch single article by ID with author + featured image
- Render: featured image (full-width), title, author name + avatar, date, markdown body via ReactMarkdown

### `src/components/articles/ArticleDetail.tsx` (client component)
- Back link to `/articles`
- Featured image hero
- Title, byline (author display_name, date)
- Body rendered with ReactMarkdown (same config as Notebook: remark-breaks, rehype-raw, custom link renderer)

## Home Page Quick Link

**Modify:** `src/components/HomeContent.tsx` — add to `allQuickLinks`:
```
{ href: "/articles", label: "Articles", color: "bg-rose-50 text-rose-700", requiresContest: null, icon: <newspaper SVG> }
```

## New Files
1. `supabase/migrations/00071_articles.sql`
2. `src/app/api/admin/articles/route.ts`
3. `src/app/api/articles/route.ts`
4. `src/components/admin/ArticleManager.tsx`
5. `src/components/admin/GalleryImagePicker.tsx` (reusable for future features)
6. `src/app/(admin)/admin/articles/page.tsx`
7. `src/app/(app)/articles/page.tsx`
8. `src/app/(app)/articles/[articleId]/page.tsx`
9. `src/components/articles/ArticleList.tsx`
10. `src/components/articles/ArticleDetail.tsx`

## Modified Files
11. `src/components/HomeContent.tsx` — add quick link
12. Admin navigation — add Articles link

## Implementation Order
1. Migration
2. Admin API route
3. GalleryImagePicker component
4. ArticleManager component + admin page
5. Player API route
6. ArticleList + ArticleDetail components + player pages
7. Home page quick link + admin nav link

## Acceptance Criteria
- [ ] Admin can create, edit, delete, and preview articles with markdown
- [ ] Admin can select a featured image from the photo gallery
- [ ] Articles can be saved as draft, scheduled for a future date, or published immediately
- [ ] Scheduled articles auto-appear when their publish date arrives (server query handles this)
- [ ] Player article feed shows only published articles, newest first, with image + title + preview
- [ ] Article detail page renders markdown with line breaks, bold, italic, underline, links, lists
- [ ] Single Enter creates a visible line break
- [ ] Internal links navigate within app, external links open in new tab
- [ ] Drafts and scheduled articles are not visible to non-admin users
