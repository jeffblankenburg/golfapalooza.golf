# Feature: Polls

## Overview

Admin-authored polls for Loozers. One active poll at a time, surfaced as a home-page button that opens a modal drawer. Polls can be scheduled, segmented (same audience model as announcements), optionally anonymous, and may auto-send a launch notification. After close, results become visible to voters and live on a `/polls/history` page.

## User Experience

### Player flow
- When an active poll exists for the user's audience, the home page shows a single CTA button displaying the poll **title** (and primary question if short).
- Tapping the button opens a **modal drawer** with the poll questions.
- Player submits answers; can re-open and change their vote until the poll closes.
- While the poll is open, results are **not** shown to players.
- Once closed, players (and anyone who was in the audience) can view results in the drawer or on `/polls/history`.
- If no active poll exists, the button is hidden entirely.

### Admin flow
- `/admin/polls` — list of all polls (draft / scheduled / active / closed) with status badges and quick actions.
- "New poll" wizard:
  1. Title + optional description
  2. Add 1+ questions; each question picks a type: **single-select**, **multi-select** (with optional max selections), or **free-text**
  3. Audience picker (mirrors announcement audience: everyone / event / custom user list)
  4. Anonymity toggle (per poll)
  5. Schedule: **Publish now** OR pick `starts_at` in the future. `ends_at` is required.
  6. "Send notification on launch" toggle (default on)
- Save as draft at any point.
- Schedule view shows a timeline of upcoming polls; conflict windows are blocked in the date picker.
- Admins can view live results at any time, even while the poll is open.
- A closed poll can be **reopened** (sets `ends_at` back into the future); existing votes are preserved.
- Edits allowed even after launch (typos happen). If options on a select question are deleted, votes referencing them are dropped with a confirmation.

## Constraints & Rules

- **One active poll at a time.** Enforced at the DB level via a partial unique index on `polls(status)` where `status = 'active'`. Scheduling overlap is blocked at the API layer with a clear error and suggested next free window.
- **Audience drift is fine.** A user's eligibility is evaluated live whenever they load the home page or open the poll. (Per product call: "the moment someone has access to the app, they have access to everything.")
- **Anonymity is per-poll.** When `is_anonymous = true`, results never expose `user_id`. The DB still records `user_id` to enforce one-vote-per-user and allow vote changes; the API simply omits it from results responses for non-admins.
- **Spectator page does NOT show polls.** Polls are personalized, matching the existing CLAUDE.md rule.
- **Scheduling is in trip timezone** (matches birthdays / tee-times convention).

## Question Types (v1)

| Type | UI | Notes |
|------|----|-------|
| `single` | Radio buttons | Pick exactly one option |
| `multi` | Checkboxes | `max_selections` (nullable = unlimited) |
| `text` | Text input | `max_length` default 500 chars |

Out of scope for v1: rating scales, image options, conditional branching, ranked-choice.

## Database

**Migration:** `supabase/migrations/00114_polls.sql`

### `polls`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| title | VARCHAR(300) | NOT NULL |
| description | TEXT | nullable |
| audience_type | TEXT | 'everyone' \| 'event' \| 'custom' |
| audience_user_ids | UUID[] | nullable, used when `custom` |
| trip_id | UUID FK → trip_settings | nullable, used when `event` |
| is_anonymous | BOOLEAN | DEFAULT false |
| send_notification_on_launch | BOOLEAN | DEFAULT true |
| status | TEXT | 'draft' \| 'scheduled' \| 'active' \| 'closed' |
| starts_at | TIMESTAMPTZ | nullable for drafts; required when scheduled |
| ends_at | TIMESTAMPTZ | nullable for drafts; required when scheduled/active |
| created_by | UUID FK → users | ON DELETE SET NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |

- Partial unique index: `CREATE UNIQUE INDEX polls_one_active ON polls ((1)) WHERE status = 'active';`
- Check constraint: scheduled/active rows require `ends_at > starts_at`.
- Updated_at trigger.

### `poll_questions`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| poll_id | UUID FK → polls | ON DELETE CASCADE |
| question_text | TEXT | NOT NULL |
| question_type | TEXT | 'single' \| 'multi' \| 'text' |
| max_selections | INT | nullable, used for `multi` |
| max_length | INT | nullable, used for `text` (default 500) |
| order_index | INT | NOT NULL |

### `poll_options`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| question_id | UUID FK → poll_questions | ON DELETE CASCADE |
| option_text | TEXT | NOT NULL |
| order_index | INT | NOT NULL |

### `poll_responses`
One row per (poll, user). Tracks who has answered and when.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| poll_id | UUID FK → polls | ON DELETE CASCADE |
| user_id | UUID FK → users | ON DELETE CASCADE |
| submitted_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |

- UNIQUE `(poll_id, user_id)`.

### `poll_answers`
One row per question answered. Select questions get one row per chosen option (so multi-select uses N rows).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| response_id | UUID FK → poll_responses | ON DELETE CASCADE |
| question_id | UUID FK → poll_questions | ON DELETE CASCADE |
| option_id | UUID FK → poll_options | nullable, set for select types |
| text_answer | TEXT | nullable, set for `text` type |

- CHECK: exactly one of `option_id` / `text_answer` is non-null.

### RLS
- `polls`: admins ALL; authenticated SELECT where `status IN ('active', 'closed')` AND user is in audience.
- `poll_questions` / `poll_options`: SELECT mirrors parent poll.
- `poll_responses` / `poll_answers`: user can SELECT/INSERT/UPDATE/DELETE only their own rows on an active poll. Admins ALL.

## Cron

**`/api/cron/polls-lifecycle`** (bearer-authed, runs every minute)
- Promotes `scheduled` → `active` when `starts_at <= NOW()`. If `send_notification_on_launch` is true, dispatches notifications via `sendBulkNotifications` to the resolved audience.
- Promotes `active` → `closed` when `ends_at <= NOW()`.

## API Routes

### Admin
**`/api/admin/polls`** — GET (list), POST (create draft or scheduled or publish-now)
**`/api/admin/polls/[id]`** — GET (with results), PUT (update), DELETE
**`/api/admin/polls/[id]/publish`** — POST: transition draft → active (now) or → scheduled (with `starts_at`)
**`/api/admin/polls/[id]/close`** — POST: transition active → closed
**`/api/admin/polls/[id]/reopen`** — POST: transition closed → active (requires new `ends_at`)
**`/api/admin/polls/conflicts`** — GET `?starts_at=&ends_at=`: returns any conflicting polls + suggested next free window

### Player
**`/api/polls/active`** — GET: returns the currently active poll for the current user (or `null`). Excludes the user's own answers from the payload (loaded separately).
**`/api/polls/[id]`** — GET: returns poll, questions, options, the current user's response (if any), and results when `status = 'closed'`.
**`/api/polls/[id]/respond`** — POST: submit or update the user's response (full replace). Validates: poll is active, user is in audience, single/multi constraints, text length.
**`/api/polls/history`** — GET: list of closed polls for the current user's eligibility, with results.

All endpoints use `getEffectiveUserId(user.id)` for simulator support.

## Components

```
src/components/polls/
├── PollHomeButton.tsx            # home page CTA, hidden when no active poll
├── PollDrawer.tsx                # modal drawer container
├── PollForm.tsx                  # renders questions, captures answers
├── PollResults.tsx               # post-close visualization (bar charts for select, list for text)
└── PollHistoryList.tsx           # /polls/history page

src/components/admin/polls/
├── PollsList.tsx                 # /admin/polls
├── PollEditor.tsx                # create / edit
├── QuestionEditor.tsx            # per-question UI
├── AudiencePicker.tsx            # reuse from announcements if available
├── ScheduleTimeline.tsx          # visual timeline showing upcoming/active polls + conflicts
└── PollAdminResults.tsx          # admin view (always visible, shows attribution unless anonymous)
```

## Edge Cases

- **No active poll** → home button hidden; `/api/polls/active` returns `{ poll: null }`.
- **User not in audience** → poll is invisible (returns null from active endpoint, 404 from detail endpoint).
- **Anonymous + admin view** → admin still sees vote counts but not user attribution. (Confirm with user during build.)
- **Editing options after votes exist** → confirm dialog if any votes reference options about to be deleted; cascade those answer rows.
- **Reopening a closed poll** → admin must supply a new `ends_at`; existing responses preserved; conflicts re-checked.
- **Audience changes mid-poll** → live evaluation, no snapshot. New eligible users see the poll; users removed from audience lose access (and their submitted votes remain in results).
- **Multi-select with `max_selections` violations** → server-side validation rejects.
- **Free-text spam** → 500-char default cap; future moderation tools out of scope.
- **Push notification dedup** → relies on existing `sendBulkNotifications` idempotency. Reopening a poll does NOT re-notify.

## Acceptance Criteria

- [ ] Admin can create a draft poll with title, description, 1+ questions of mixed types, and audience.
- [ ] Admin can publish now or schedule for the future, with required `ends_at`.
- [ ] Schedule UI prevents overlapping windows and surfaces the conflict.
- [ ] Anonymity toggle hides user attribution from non-admin results responses.
- [ ] Active-poll button appears on home for eligible users; hidden otherwise.
- [ ] Drawer renders all 3 question types correctly on mobile.
- [ ] Players can change their vote until close.
- [ ] Launch notification fires when toggled on, only on first activation.
- [ ] Closed polls show results in drawer and on `/polls/history`.
- [ ] Admins can reopen a closed poll and supply a new `ends_at`.
- [ ] Spectator page shows no polls.
- [ ] All endpoints use `getEffectiveUserId` and proper auth checks.
- [ ] README.md updated with the new feature.

## Open Questions

- **Anonymous polls — admin attribution?** Should admins be able to see who voted what on anonymous polls (for moderation), or is anonymity true even from admins? Default proposal: admins see counts only, not attribution, on anonymous polls. Confirm during implementation.
- **Reminder notifications** ("poll closes in 2 hours, you haven't voted") — out of scope for v1, future enhancement.
- **CSV export of free-text answers** — out of scope for v1; admin can copy from the results page if needed.
