# Golfapalooza

The official app for Golfapalooza — a multi-day golf trip with live scoring, contests, social features, and trip management. Built as an installable PWA.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database/Auth**: Supabase (PostgreSQL + SMS OTP login)
- **Styling**: Tailwind CSS
- **Maps**: Mapbox GL (satellite imagery)
- **Deployment**: Vercel
- **PWA**: Installable on mobile with push notifications

---

## Features

### Home Page
- Trip countdown with days remaining
- Latest article with featured image and preview
- Spirit Wear Store card — prominent link to the external apparel shop (opens in a new tab) with a strip of product photos; also shown on the public spectator home
- RSVP status with attendance likelihood (99%/75%/50%/25%)
- Participant list grouped by likelihood
- Tee time card with starting hole, time, and teammates
- Live scoring cards (appear 1 hour before tee time)
- Schedule "Up Next" card
- Calcutta roster and winnings
- Financial balance summary
- Trip options deadline
- Action items checklist with completion count
- Quick links grid (filtered by active contests and visibility rules)

### Live Scoring — My Rounds
- **Three entry modes**: Quick Entry (final score only), Full Scorecard (hole-by-hole table), Live Scoring (one hole at a time)
- **Live scoring interface**: +/- buttons for strokes and putts per player per hole
- Running stroke total per player, color-coded to par
- Mini scorecard with Out/In/Tot columns and birdie circles / bogey squares
- Score description labels (Eagle, Birdie, Par, Bogey, etc.)
- Satellite map view with blue tee dot, green green dot, and draggable amber distance circle
- Dashed distance lines with yardage labels (tee→circle→green)
- Overhead and green image views
- Auto-save with 600ms debounce, flush on exit
- Multi-player support (up to 4 players per round)
- Guest players — add someone who isn't in the app by typing their name (at round creation or mid-round via "Add player"). Their strokes and putts are tracked and their scorecard is saved like any other player. Guests are unattached to any account, have no handicap, and never appear in handicap calculations or on anyone's profile.
- Course search with tee selection per player
- 18-hole, Front 9, and Back 9 round types
- **Scramble format** — at round creation, choose "Own ball" (everyone plays their own ball) or "Scramble" (the whole group plays one team ball). Scramble rounds use a dedicated live scorer with a single team score per hole (no per-player entry, no putts), stay in sync across devices like any round, and are **excluded from every player's handicap** and from the personal avg/best stats and the global Recent Rounds feed. They appear in each player's round history badged "Scramble," and the round detail page collapses to a single Team card.
- Full scorecard view with 9-hole and 18-hole totals
- Putt tracking per hole with totals on round detail
- Co-equal round ownership — every player in a round can edit scores, complete the round, add/remove other players, and delete the round (with confirmation). The original "creator" is shown as the attribution but no longer gates any action.
- Push notification when someone adds you to a round, with a one-tap deep link into the live scorer (`round_invite` notification type).
- Live scoring stays in sync across devices — when two players in the same group both have the round open, score edits propagate within ~1 second. Last-write-wins; in-progress local edits are protected from being overwritten by remote echoes. Header shows a Live/Connecting/Offline badge.

### Course Library
- `/courses` lists every course in the system with the active event's course featured on top.
- Any Loozer can edit hole data, tees, GPS coordinates, and images on unlocked courses. Admins can lock courses (typically the active event course) to freeze them from community edits.
- The map editor — the same satellite tool the admin tools have always had — is now available to every Loozer. A persistent help drawer explains the five mapped points (tee, green center, green front, green back, ideal drive) and what each one is for.
- When no ideal-drive point is set, the map shows a 250-yard ghost marker toward the green so contributors can see the default that will apply.
- Editing a course never changes stored round stats (gross / adjusted / differential / handicap are snapshotted at completion).
- The home page's old "Course" tile is now "Courses"; `/course` redirects to the new library.

### USGA Handicap System
- Automatic handicap index calculation using World Handicap System rules
- Score differential computed on round completion
- Net Double Bogey adjustment applied when hole-by-hole scores exist
- WHS lookup table (best N of 20 differentials with adjustments)
- Soft cap (50% reduction above Low HI + 3.0) and hard cap (max Low HI + 5.0)
- Truncation to 1 decimal place per WHS spec
- Handicap history logging with calculation method
- Handicap index displayed on player profiles
- Event-level handicap locking (admin snapshots current values for the trip)
- Manual handicap override per player

### KGB Cup (Ryder Cup-Style Team Event)
- Two teams with customizable names and colors
- Player pairs with foursomes derived automatically
- Three match sections per foursome: individual match play (x2), pair scramble
- Per-foursome adjusted handicaps (relative to lowest player)
- Two-man scramble handicap auto-calculation (35% lower CH + 15% higher CH)
- Per-foursome pair handicap offset (lower pair plays at 0)
- Live hole-by-hole scoring with stroke allocation dots
- Section-by-section point tracking
- Real-time scoreboard and group results
- Contest tee assignments per hole

### Scramble Contests (Daily Team Events)
- 4-man scramble teams with drag-and-drop assignment
- Team handicap auto-calculation (weighted 20/15/10/5 formula, supports 2-5 players)
- User-facing handicaps offset so lowest team plays at 0
- Live scoring with team leaderboard
- Gross and net scoring with per-hole stroke allocation
- BSPITW (Best Shot Played in the World) bonus point tracking
- Score verification workflow (close scoring → verify)
- Scorecards page with day tabs, tee sheet, and detailed team scorecards

### Skins
- Per-hole skin winners tracked across scramble days
- Payout tracking

### Daily Games
- Closest to Pin (Front 9 and Back 9)
- Long Drive
- Long Putt
- Winners organized by event day

### 100 Feet
- Closest to 100 feet from the pin contest
- Results tracked by hole and day

### Pick'em
- Sports prediction/betting game
- Locked until admin opens picks
- Game-time deadline with urgent notification (3 hours before)
- "MAKE PICKS" pulse on home page when urgent

### Calcutta Auction
- Team ownership via auction
- Bid tracking and buyer management
- Share percentages for co-ownership
- Prize pool calculation from total bids
- Prize distribution with linked contest winners
- Buyer payment tracking
- Winnings displayed on home page with breakdown
- Accolade badges surfaced on the display: the Loozers tab shows a capped badge row (top 3 by prestige, `+N` overflow) under each player's name; tapping it opens their full accolades view. Doubles-cornhole wins show both teammates and repeat wins in a category collapse to a single `× N` row. Badge images (`accolade_categories.icon_url`) render when uploaded, falling back to the emoji icon. The live auction spotlight's "Past Wins" card uses the same rendering.

### Cornhole
- Singles and doubles tournament brackets
- Singles final is a best-of-3 series (admin records each game; the bracket advances only when one player reaches 2 wins)
- Real-time bracket updates with polling
- "Show real names" toggle (only when full names exist)

### Chat
- Direct messages and group conversations
- Chat rooms with admin-created permanent rooms
- Message reactions (tapbacks)
- GIF picker (Giphy integration)
- Typing indicators
- Read receipts and unread counts
- Image sharing
- Push notification on new messages

### Photo & Video Gallery
- Upload photos and videos with captions
- Tag other users in media
- Filter by photographer and year
- Sort by upload or taken date
- EXIF data extraction for photo dates
- Emoji reactions on media
- Comments on photos/videos
- Infinite scroll with lazy loading
- Deep-link sharing to specific photos

### Music
- Browse and stream songs
- Tag songs to specific users
- Mark favorites
- Sort by category and title
- Mini player UI (always available)
- Play count tracking

### Articles & Announcements
- Admin publishes articles with markdown content
- Featured images from the gallery
- Draft, scheduled, and published states
- Article readership tracking (who read what, when)
- View counts displayed in admin
- Latest article card on home page with hero image

### Polls
- Admin-authored polls with single-choice, multi-choice, or free-text questions
- Same audience targeting as announcements (everyone, current event, custom)
- Optional anonymity (results show counts only — admins included)
- Schedule for the future or publish now; only one poll active at a time
- Optional push notification when a poll launches
- Single home-page CTA when an active poll exists for the user; hidden otherwise
- Modal drawer to vote; users can change or withdraw their vote until close
- Results visible to voters and audience members after the poll closes
- `/polls` shows past polls and their results
- Admins can edit, close early, or reopen closed polls with a new end time

### Financials
- Per-user balance tracking (charges and payments)
- Transaction history by trip
- Balance card on home page (color-coded: red for owed, green for credit)
- Admin ledger with all user balances

### Trip Options
- Merchandise and add-on selection
- Deadline tracking with countdown
- Quick link hidden until options are open

### Schedule & Itinerary
- Day-by-day event schedule
- Event locations and times
- Optional long-form descriptions per item (e.g. meal menus), with line breaks preserved
- Timezone-aware display
- Personal tee time assignments integrated into schedule

### Room Assignments
- Room assignments by facility
- Room features (bed type, smoking, showers, etc.)
- Roommate listing

### Nominations
- Nominate new rookies
- Admin approval/rejection workflow

### Birthdays
- `birthday` field on Loozer profiles, editable by the user on `/profile` or by admins on `/admin` → Users
- Loozer table on the Calcutta page shows each player's current age (decimal to one place)
- Home page banner (authenticated only): when any Loozer has a birthday today, a gradient card appears at the top with their avatar, age, and floating balloon/party emojis. Tapping the card opens their profile.
- Daily chat auto-post to "All Loozers" at ~8 AM Eastern (13:00 UTC) — a randomly selected message from 50 templates. One post per Loozer per year, enforced by `birthday_posts` table
- Today's date is resolved in the active trip's timezone

### Fake Ads
- Admin-uploaded humor banner ads shown on the authenticated home page, spectator home, and Loozer profile pages
- Ads can be tagged with zero or more Loozers (many-to-many)
- Authenticated home page: random carousel of active ads, auto-advances every 6s with dot navigation and swipe support; clicking a tagged ad jumps to the tagged Loozer's profile (random if multiple tags)
- Spectator home: same carousel but non-clickable, since spectators do not have access to Loozer profiles
- Loozer profile page: only ads tagged with that Loozer appear, rendered as a non-clickable static carousel after the Bio
- Admin page at `/admin/fake-ads`: upload a 1200&times;400 image (3:1, min width 1200px for retina sharpness — validated client-side), set alt text, multi-select Loozers to tag, toggle active/inactive, delete

### Notebook
- Trip notes organized by category
- Markdown content with internal app links
- Pinned notes to specific pages (financials, my-rounds, daily-games, options)
- Expandable/collapsible notes
- Read-only mirror at `/spectator/notebook` for the public spectator site

### Player Profiles
- Display name, full name, email, phone
- Avatar upload
- Birthday, occupation, location
- Golf details: playing since, swing type, typical shot
- Shirt size
- Fun facts and best shot stories
- Handicap index display
- Eight-bag average and average scramble score
- Accolades and achievements
- Sponsorship: each Loozer was either a Founding Father (badge) or was sponsored by another Loozer (shown as "Sponsor: [avatar] X")

### Loozer Family Tree
- Every Loozer (except the founders) was brought in by another Loozer — that relationship is captured by `is_founder` and `sponsor_id` on `users`
- Admin sets a Founding Father toggle or picks a sponsor from a searchable list (avatar + name); self and descendants are filtered out to prevent cycles
- A Loozer with sponsees can't be deleted until those sponsees are reassigned
- `/loozers` (authenticated only) has a Grid | Tree toggle (persisted per-device); the Tree view is a vertical org chart with pinch-zoom and pan, opens centered on the current user's node and highlights it
- The spectator site does not expose Loozer profiles or the family tree
- Financial-only users are excluded from the tree

### Course Information
- Course layout with hole-by-hole data
- Par, yards, and handicap index per hole
- Satellite maps with tee, green, and drive markers
- Draggable distance measurement circle
- Overhead and green images per hole

### Push Notifications
- Web Push via VAPID keys
- Permission prompt on home page
- Notification types: chat messages, announcements, nominations, gallery tags, tee time reminders
- Tee time reminders via cron (configurable minutes before)
- Unread count badges in header

---

## Admin Capabilities

### Event Management
- Create and archive trips with start/end dates
- Configure timezone
- Link courses and facilities to events
- Event day management with custom names

### Smart Visibility
- Auto time-gating: features appear at the right time (scoring 1hr before tee time, rooms 1 week before trip, etc.)
- Admin force-override: toggle any feature visible for demos or testing
- Per-feature status display (Visible/Hidden with auto rule description)

### Roster & Participants
- Add/remove event participants
- RSVP tracking with likelihood percentages

### Contest Management
- Create contests (scramble, ryder_cup, calcutta, pickem, cornhole_singles, cornhole_doubles)
- Assign contest days and tees
- Contest-specific scoring lifecycle (open → close → verify)
- **Auto-enroll on attendance** — contests flagged `auto_enroll_attendees` (Calcutta, per-day Scramble, KGB Cup) automatically add every Loozer who is on the trip roster. RSVPing "yes" or an admin checking the attendance cell enrolls them; going off the roster removes them, but the admin toggle refuses (and warns) when doing so would orphan a Calcutta bid, scramble team seat, or KGB pairing. A manual de-enroll (`contest_enrollment_exclusions`) is remembered so attendance sync won't re-add someone who opted out while staying on the trip. Per-option contests (cornhole, skins, pickem) still enroll only on the matching option opt-in.

### KGB Cup Admin
- Team creation with colors and names
- Player-to-pair assignments
- Auto-derived foursomes from pair matchups
- Handicap calculation and snapshot
- Two-man scramble handicap calculation with formula explanation
- Per-hole tee assignments
- Score entry and verification

### Scramble Admin
- Team creation and player assignment
- Team handicap auto-calculation (2-5 player weighted formula)
- Score entry with hole-by-hole grid
- BSPITW bonus point management
- Scoring lifecycle management

### Handicap Management
- Event-level handicap locking (snapshot all participants)
- Individual handicap override
- Lock/unlock/re-lock controls
- Live vs. locked handicap comparison

### Tee Times
- Create tee time groups per day
- Auto-populate from KGB Cup foursomes
- Assign starting holes and times
- Tee time push notification reminders (configurable timing)

### Financial Management
- Charge and payment recording per user
- Transaction ledger with trip and lifetime views
- Balance summary across all participants

### Course Management
- Course search and creation
- Tee box management (name, color, rating, slope, par)
- Hole-by-hole data editing (par, handicap index, yards)
- Map editor: place tee, green, and ideal drive markers with satellite imagery
- Overhead and green image upload per hole
- Auto-geocoding for courses without coordinates

### Content Management
- Article editor with markdown and preview
- Gallery image picker for featured images
- Draft/schedule/publish workflow
- Readership tracking with per-article view counts
- Notebook notes with categories and pinning
- Announcement broadcasting with scheduling
- Polls with single/multi/free-text questions, audience targeting, anonymity toggle, scheduling, and reopen support

### Daily Games & Contests
- Daily winner recording (CTP, Long Drive, Long Putt)
- 100 Feet distance tracking
- Skins winner management
- Calcutta auction management (bids, prizes, payouts)
- Pick'em game management
- Cornhole bracket management

### Gallery Management
- Photo/video moderation
- Bulk management tools

### Music Management
- Song library management
- User tagging

### Room Management
- Facility and room setup
- Room assignment per trip

### Accolades
- Award creation and winner assignment per trip

### Simulator
- Date simulation for testing time-gated features
- User impersonation for testing user-specific views

### Analytics
- App usage tracking
- Article readership analytics

---

## Getting Started

1. Clone the repository
2. Copy `.env.local.example` to `.env.local` and add credentials
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GOLF_COURSE_API_KEY=your-golfcourseapi-key         # Optional, for external course search
NEXT_PUBLIC_GIPHY_API_KEY=your-giphy-api-key        # For GIF search in chat
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-token           # For satellite maps
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key   # For push notifications
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:your-email
CRON_SECRET=your-cron-secret                         # For scheduled tasks
```

## Deployment

Deployed to Vercel with automatic deployments from `main`. Cron jobs run on Vercel for scheduled announcements and tee time reminders.

## API Documentation

Interactive API documentation is available at `/api-docs` when the app is running.
