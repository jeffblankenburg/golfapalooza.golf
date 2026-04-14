## Overview

Track which users read which articles and when. Display readership stats in the admin article manager.

## Database

### `article_views`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| article_id | UUID FK → articles | CASCADE DELETE |
| user_id | UUID FK → users | CASCADE DELETE |
| viewed_at | TIMESTAMPTZ | DEFAULT NOW() |
| UNIQUE | (article_id, user_id) | One view per user per article |

Note: unique constraint means we track whether a user read the article, not how many times. `viewed_at` updates on subsequent views via upsert.

## Implementation

### Record a view
- When a user opens an article detail page (`/articles/[articleId]`), fire a POST to `/api/articles/[articleId]/view`
- Server upserts into `article_views` (on conflict update `viewed_at`)
- Fire-and-forget from the client — don't block page rendering

### Admin UI
- On the ArticleManager, show a view count badge next to each article title
- Expandable section showing which users have read the article, with timestamps
- Endpoint: `GET /api/admin/articles/views?article_id={id}` returns list of readers

## Acceptance Criteria

- [ ] Opening an article records a view for the current user
- [ ] Viewing the same article again updates the timestamp (no duplicates)
- [ ] Admin can see total view count per article
- [ ] Admin can see which specific users have read each article
