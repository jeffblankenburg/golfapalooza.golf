# Golfapalooza Product Roadmap

## Vision Statement

Golfapalooza is a **golf social platform** that combines live scoring, handicap tracking, and social networking to create the most engaging golf experience on mobile. Think "Strava for Golf" meets "Instagram for Golfers."

The app should make golfers feel connected to their friends, their game, and the broader golf community - whether they're on the course or on the couch.

---

## Current State (MVP)

What we have today:
- Course detection via GPS
- Course search
- Basic round creation wizard
- Tee selection (single tee for entire round)
- Round type selection (18, front 9, back 9)
- Date selection
- Player management
- Handicap calculation (USGA WHS)
- Basic admin user management

---

## Product Phases

### Phase 1: Core Round Experience

**Goal:** Make the round creation and scoring experience match or exceed 18 Birdies.

#### 1.1 Per-Player Tee Selection
- Each player in a round can play from different tees
- Default new players to the round creator's tee selection
- Show tee color/name on scorecard per player
- Handicap strokes calculated per player's tee

#### 1.2 Starting Hole Selection
- Allow rounds to start on any hole (shotgun starts)
- "Front 9 First" vs "Back 9 First" toggle
- Custom starting hole (1-18)
- Scoring UI adapts to show holes in play order

#### 1.3 Scoring Modes
| Mode | Description |
|------|-------------|
| **Stroke Play** | Traditional scoring (current) |
| **Match Play** | Hole-by-hole competition, track holes won/lost/halved |
| **Stableford** | Points-based scoring (0-4+ points per hole) |
| **Scramble** | Team format, best ball each shot |
| **Best Ball** | Team format, best individual score per hole |
| **Skins** | Money/points for winning holes outright |

#### 1.4 Round Settings
- **Exclude from Handicap** - Practice rounds, non-regulation courses
- **Gimme Distance** - Auto-record putts inside X feet as made
- **Pace of Play Tracking** - Optional time-per-hole tracking
- **Weather Conditions** - Record weather for round context

---

### Phase 2: Round Privacy & Tournaments

**Goal:** Give users control over their data and support organized events.

#### 2.1 Round Visibility Settings
| Setting | Description |
|---------|-------------|
| **Public** | Anyone can see this round |
| **Friends Only** | Only friends can see |
| **Private** | Only participants can see |
| **Unlisted** | Only viewable via direct link |

#### 2.2 Tournament Mode
- Create tournament events with multiple rounds
- Leaderboard across all participants
- Flight/division support
- Handicap vs gross scoring options
- Tournament admin controls
- Invite system for participants
- Scheduled tee times

#### 2.3 Round Sharing
- Share round summary to social media
- Generate shareable scorecard images
- Deep links to round details

---

### Phase 3: Social Foundation

**Goal:** Build the social graph and user identity that powers engagement.

#### 3.1 User Profiles
- Profile photo & cover image
- Bio/about section
- Home course designation
- Handicap display (with history chart)
- Stats dashboard:
  - Rounds played (this year / all time)
  - Scoring average
  - Best round
  - Eagles/birdies/pars counts
  - Fairways/GIR percentages (if tracked)
- Favorite courses list
- Equipment/bag (optional)

#### 3.2 Friends & Following
- Send/accept friend requests
- Follow users (one-way, public profiles)
- Block users
- Friends list with online/playing status
- "Find Friends" via contacts, username search
- Suggested friends (mutual friends, same courses)

#### 3.3 Activity Feed
- Personal feed showing:
  - Your rounds
  - Friends' completed rounds
  - Friends' achievements (personal bests, eagles, etc.)
  - Course check-ins
  - Profile updates
- Feed algorithm prioritizing:
  - Recency
  - Engagement (rounds with comments)
  - Relevance (your courses, mutual friends)

#### 3.4 Notifications
- Friend requests
- Round invitations
- Comments on your rounds
- Likes/reactions on your rounds
- Friends starting/finishing rounds
- Weekly handicap updates
- Achievements unlocked

---

### Phase 4: Social Engagement

**Goal:** Make the app sticky through meaningful interactions.

#### 4.1 Round Interactions
- **Like/React** to completed rounds
- **Comment** on rounds (during or after)
- **Cheer** players during live rounds
- **Share** rounds to feed or external

#### 4.2 Live Round Following
- See friends currently playing in real-time
- Hole-by-hole score updates
- "Watch" a round as spectator
- Send encouragement/reactions during play
- Push notifications for notable events (birdie, eagle, etc.)

#### 4.3 Messaging
- Direct messages between friends
- Group chats for regular playing groups
- Round-specific group chat (participants)
- Message reactions
- Photo/image sharing in chat

#### 4.4 Achievements & Gamification
- Achievement badges:
  - First round, 10th round, 100th round
  - First birdie, first eagle, hole-in-one
  - Course milestones (play X different courses)
  - Social milestones (X friends, X comments)
  - Streak achievements (rounds per week/month)
- Leaderboards:
  - Friends leaderboard (handicap, scoring avg)
  - Course leaderboards (best rounds at each course)
  - Weekly/monthly challenges

---

### Phase 5: Advanced Features

**Goal:** Differentiate with innovative features.

#### 5.1 Smart Shot Tracking
- GPS-based shot detection
- Automatic shot distance calculation
- Club selection tracking
- Shot shape/dispersion analysis
- Strokes gained analysis
- AI-powered club recommendations

#### 5.2 Side Games & Gambling
- Nassau (front/back/total bets)
- Skins with carryovers
- Wolf
- Dots/Trash
- Custom point games
- Settlement tracking (who owes whom)
- Venmo/payment integration (optional)

#### 5.3 Course Features
- Course reviews & ratings
- Course photos from users
- Course conditions reporting
- Pace of play reporting
- Tee time deals/integration
- Course flyover videos

#### 5.4 Advanced Analytics
- Detailed statistics dashboard
- Trends over time
- Weakness identification
- Practice recommendations
- Comparison to friends/handicap peers
- Export data for coaching

#### 5.5 Integrations
- Apple Watch / Wear OS companion
- Apple Health / Google Fit sync
- Launch monitor integration (Garmin, etc.)
- Tee time booking partners
- Equipment tracking (club distances)

---

## Technical Considerations

### Database Schema Additions

```
-- Phase 1
round_player_tees (player-specific tee selection)
scoring_modes (enum or lookup table)

-- Phase 2
round_visibility (enum)
tournaments
tournament_rounds
tournament_participants

-- Phase 3
user_profiles (extended user data)
friendships (bidirectional relationships)
follows (unidirectional)
activity_feed_items
notifications

-- Phase 4
round_comments
round_reactions
messages
message_threads
achievements
user_achievements

-- Phase 5
shots (GPS tracked shots)
shot_clubs
side_games
side_game_participants
course_reviews
```

### Infrastructure Needs

| Phase | Infrastructure |
|-------|---------------|
| 1-2 | Current stack sufficient |
| 3 | Real-time subscriptions (Supabase Realtime) |
| 4 | Push notifications (FCM/APNs), WebSockets |
| 5 | GPS processing, ML for shot detection, payment processing |

### Privacy & Compliance

- GDPR compliance for EU users
- Data export functionality
- Account deletion with data purge
- Content moderation for comments/messages
- Age verification (gambling features)
- Terms of Service updates per phase

---

## Success Metrics

### Engagement Metrics
- Daily Active Users (DAU)
- Rounds recorded per user per month
- Social actions per user (likes, comments, messages)
- Friend connections per user
- Session duration
- Retention (D1, D7, D30)

### Quality Metrics
- Round completion rate
- GPS accuracy (shot tracking)
- App crashes / errors
- User-reported issues

### Growth Metrics
- New user signups
- Viral coefficient (invites sent/accepted)
- Organic vs paid acquisition
- Course coverage (% of courses with rounds)

---

## Competitive Landscape

| App | Strengths | Weaknesses | Our Opportunity |
|-----|-----------|------------|-----------------|
| **18 Birdies** | GPS, clean UI, established | Subscription fatigue, limited social | Better social, free tier |
| **Grint** | Handicap focus, GHIN integration | Dated UI, weak social | Modern UX, richer social |
| **Golf Pad** | Accurate GPS, watch apps | Minimal social, utilitarian | Social-first approach |
| **Hole19** | Good free tier, course data | Limited game modes | More game variety |
| **Arccos** | Best shot tracking | Requires hardware, expensive | Software-only option |

**Our Differentiation:** Social-first golf platform that makes golf a connected experience, not just a tracking utility.

---

## Open Questions

1. **Monetization Strategy**
   - Freemium with premium features?
   - Subscription tiers?
   - Ads (non-intrusive)?
   - Affiliate revenue (tee time bookings)?

2. **Content Moderation**
   - How to handle inappropriate comments/messages?
   - User reporting system?
   - Automated vs manual review?

3. **Data Partnerships**
   - Course data providers (beyond current API)
   - Tee time booking partners
   - Equipment brands for bag tracking

4. **Platform Priority**
   - PWA (current) vs native iOS/Android?
   - When to invest in native apps?

---

## References

- [18 Birdies](https://18birdies.com) - Primary competitor
- [The Grint](https://thegrint.com) - Handicap-focused competitor
- [Hole19](https://hole19golf.com) - European market leader
- [Golf Pad](https://golfpadgps.com) - GPS-focused competitor
- [Arccos Golf](https://arccosgolf.com) - Premium shot tracking

---

*Document Version: 1.0*
*Last Updated: January 2026*
