# Soundboard (v2)

A per-group board of tappable sound clips (air-horn, applause, inside jokes, catchphrases). The board itself is an **operator tool**: admins, plus individual members an admin grants access to, open a drawer to play, blast, and manage sounds. When an operator blasts the group, the clip plays on **every member's device** in real time; regular members have no board but can mute blasts in their settings like any notification. Group-wide. Net-new feature (no v1 equivalent).

## Locked decisions

| Decision | Choice |
| --- | --- |
| Two roles | **Operators** (admins + members granted `manage_soundboard`) see and drive the board — play, blast, add, edit, delete, manage tags. **Receivers** = all other members: no board, they just hear blasts. |
| Member opt-out | Every member can turn **"Hear soundboard blasts"** off in their settings (default on), exactly like a notification preference. |
| Playback | Local by default when an operator taps; **"Blast to group"** broadcasts the clip to all members (minus opt-outs) in real time. |
| Interface | **One consistent drawer.** The surface an operator plays from is the same one they add/edit/tag with. No separate admin CRUD page. Must be **snappy** (see Performance). |
| Icons | **Emoji by default, optional uploaded image override.** |
| Tags | **First-class, group-consistent tag entity** (not free text). Operators sort / filter / group the board by tag; jumping between tags is instant. |
| Delete | **Hard delete + `ConfirmModal`.** |
| Play tracking | **Full history** (`v2_sound_plays`) for "top blaster" + denormalized counters for instant "most played" (group) and "my most played" (per user). |
| Scope | **Group-wide** (like Music), not event-scoped. |

## Roles & access

- **Group enable** — an admin turns the soundboard on/off for the group (one switch in `/admin/features`). Off = nothing mounts for anyone.
- **Operator** — an org admin, or a member granted the `manage_soundboard` permission. Operators get the top-nav trigger + full drawer. Grant is per-user (admin grants individuals, as a power tool).
- **Receiver** — every active member once the group is enabled. No trigger, no drawer, no catalog browsing. Their only touchpoint is hearing blasts + the opt-out toggle. Receivers who haven't been granted operator access don't see any board UI.

## Surface

One `SoundboardProvider`, mounted in the event layout whenever the group is enabled:

- **Receiver half (every member, unless opted out):** subscribes to the blast channel and plays incoming clips. Lightweight, always live app-wide so a member hears a blast on whatever screen they're on.
- **Operator half (admins + grantees only):** renders the top-nav trigger and the drawer overlay (z-50, under the reserved navs). Opens over the current page, closes back to the same spot, never navigates away. Preloads audio buffers for instant playback.

## One drawer, snappy (Performance)

Responding fast is the hallmark of this feature, so the operator drawer is engineered for zero-latency interaction:

- **Instant playback via Web Audio.** On drawer open, prefetch every clip and `decodeAudioData` into in-memory `AudioBuffer`s (clips are short). A tap fires an `AudioBufferSourceNode` on a shared, pre-unlocked `AudioContext` — no network fetch, no `<audio>` element spin-up, and taps can overlap/layer. A small loading shimmer covers the one-time decode.
- **Client-side everything after first load.** One payload on first open: all sounds (with `tag_id`s, counters, URLs) + all tags + the caller's personal top-played. Tag switching, filtering, grouping, and search are pure in-memory operations — no round-trip when jumping between tags.
- **Quick lists.** A persistent **"My most played"** row (from the per-user counter, instant) and a group **"Most played"** view, so the operator reaches their go-to sounds in one tap without scrolling.
- **Optimistic counters.** Play count bumps immediately in the UI; the play log + counter writes fire async via the RPC.
- **Tag-first navigation.** Tag chips / grouped sections are the primary axis; selecting a tag re-slices the in-memory list instantly.

## Data model

### `v2_sounds`
```
id            uuid pk default gen_random_uuid()
org_id        uuid not null references v2_organizations(id) on delete cascade
name          text not null
audio_url     text not null          -- public URL in v2-soundboard bucket
audio_path    text not null          -- storage path, for deletion cleanup
emoji         text                   -- default icon
image_url     text                   -- optional uploaded icon override
image_path    text                   -- storage path, for deletion cleanup
play_count    integer not null default 0     -- denormalized group counter, bumped on play
sort_order    smallint not null default 0
created_by    uuid references v2_profiles(id) on delete set null
created_at    timestamptz not null default now()
updated_at    timestamptz not null default now()
```
Indexes: `(org_id, sort_order, name)`, `(org_id, play_count desc)`.

### `v2_sound_tags` (first-class, group-consistent vocabulary)
```
id          uuid pk default gen_random_uuid()
org_id      uuid not null references v2_organizations(id) on delete cascade
name        text not null
color       text                      -- optional chip styling
sort_order  smallint not null default 0
created_at  timestamptz not null default now()
updated_at  timestamptz not null default now()
```
`UNIQUE (org_id, lower(name))` — enforces one canonical spelling per group (no "funny" / "Funny" drift). Renaming a tag updates it here once and every sound reflects it (names live here, not on the sound).

### `v2_sound_tag_map` (M:N)
```
sound_id  uuid not null references v2_sounds(id) on delete cascade
tag_id    uuid not null references v2_sound_tags(id) on delete cascade
primary key (sound_id, tag_id)
```
Index on `(tag_id)`. A sound can carry several tags and appears under each when grouping.

### `v2_sound_plays` (history → "top blaster")
```
id         uuid pk default gen_random_uuid()
org_id     uuid not null references v2_organizations(id) on delete cascade
sound_id   uuid not null references v2_sounds(id) on delete cascade
user_id    uuid not null references v2_profiles(id) on delete cascade
played_at  timestamptz not null default now()
```
Indexes: `(sound_id)`, `(org_id, played_at desc)`.

### `v2_sound_user_plays` (per-user counter → instant "my most played")
```
user_id       uuid not null references v2_profiles(id) on delete cascade
sound_id      uuid not null references v2_sounds(id) on delete cascade
org_id        uuid not null references v2_organizations(id) on delete cascade
play_count    integer not null default 0
last_played_at timestamptz not null default now()
primary key (user_id, sound_id)
```
Index on `(org_id, user_id, play_count desc)`. Denormalized cache (derivable from `v2_sound_plays`), kept so the "my most played" quick list is an O(1) indexed read, not an aggregate.

### RPC `v2_log_sound_play(p_sound_id uuid)` (SECURITY DEFINER)
One round-trip, one transaction: insert the `v2_sound_plays` row, bump `v2_sounds.play_count`, and upsert `v2_sound_user_plays` (+1, touch `last_played_at`). Returns the new group count. Keeps all three read paths instant with no render-time aggregation.

### RLS / grants (mirror `v2_songs`)
- `v2_sounds`, `v2_sound_tags`, `v2_sound_tag_map`: SELECT = `v2_is_org_member(org_id)` (interface is app-gated to operators regardless); write = `v2_is_org_admin(org_id)` at the DB layer, with operator (`manage_soundboard`) enforcement in the API via the service-role client.
- `v2_sound_plays` / `v2_sound_user_plays`: INSERT/UPSERT where `user_id = auth.uid()`; SELECT = member.
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated, service_role;`
- `updated_at` triggers on `v2_sounds` and `v2_sound_tags`.

### Member preference
`receive_soundboard_blasts boolean not null default true` — a per-member notification-style preference. Place it with the existing v2 member/notification preferences (confirm exact store during build: a column on `v2_memberships` or the member-notification-preferences table). Surfaced on the member settings screen next to other notification toggles.

Migrations: `NNNNN_v2_soundboard.sql` (all tables + RPC), `NNNNN_v2_soundboard_bucket.sql`, `NNNNN_v2_soundboard_pref.sql` (if a new column/table is needed for the opt-out).

## Storage

Bucket `v2-soundboard`, public-read, service-role write (gated by `manage_soundboard`).
- Audio under `${orgId}/audio/${ts}-${userId}.{ext}`; MIME `audio/mpeg|mp3|wav|ogg|webm`; limit ~5 MB (short clips).
- Image icons under `${orgId}/images/${ts}-${userId}.{ext}`; standard image MIMEs.
- **Upload via signed URL** (direct browser → storage), like Music/Gallery, to sidestep the 4.5 MB Vercel function-body limit. Public URLs mean receivers can play a blasted clip straight from the broadcast payload without any catalog read.

## API routes

All writes gate on **operator** = `isOrgAdmin || hasPermission(user, "manage_soundboard")` and require the group to be enabled. `v2GetUser` → operator gate → `v2AdminClient` for writes. `getEffectiveUserId` for simulator correctness.

- `POST /api/v2/soundboard/upload-url` — operator; signed URL(s) + path(s) for audio and/or image.
- `POST /api/v2/soundboard/sounds` — operator; create sound (+ its tag_ids).
- `PATCH /api/v2/soundboard/sounds/[id]` — operator; edit name/emoji/image/sort_order/tags.
- `DELETE /api/v2/soundboard/sounds/[id]` — operator; delete row + storage objects (mappings cascade).
- `POST /api/v2/soundboard/reorder` — operator; batch `sort_order` (one `.in(...)`).
- `GET/POST/PATCH/DELETE /api/v2/soundboard/tags` — operator; manage the group tag vocabulary.
- `POST /api/v2/soundboard/sounds/[id]/play` — operator; calls `v2_log_sound_play`; client-throttled.
- `PATCH /api/v2/soundboard/preferences` — any member; set `receive_soundboard_blasts`.
- Initial drawer data: one SSR/endpoint payload (sounds + tags + my-most-played).

## Broadcast

- **Channel:** Supabase **broadcast** (ephemeral, not postgres_changes), `soundboard:${orgId}`, payload `{ soundId, audioUrl, name, fromUserId }`. Helper `src/lib/v2/realtime/soundboard-channel.ts`.
- **Sender:** an operator with "Blast to group" on. Blasting also plays locally + logs the play.
- **Audience:** every member whose provider is mounted (group enabled) and who hasn't opted out. The receiver plays the clip from `audioUrl` immediately (public bucket; cache after first hear). Optionally a subtle toast ("🎺 Dave blasted Airhorn").
- **Audio unlock for passive receivers:** iOS/mobile won't auto-play audio until the user has made a gesture this session. Since regular members never tap a board, unlock the shared `AudioContext` on the **first user gesture anywhere in the app** (a one-time global listener). A blast still can't play if the app is backgrounded or the phone is locked — inherent to the web; the realistic use is "everyone has the app open." Operators additionally unlock on their first tap.
- **Rate limiting:** client cap (e.g. max N blasts / 10s per operator) + server throttle on the play path.

## Feature registry wiring (`src/lib/v2/features.ts`)

Permission-gated drawer, so it diverges from the standard `off/everyone/admins` visibility. Small extension:

1. `FEATURE_CATALOG` entry:
   ```ts
   { key: "soundboard", label: "Soundboard", bucket: "community", scope: "group",
     icon: "soundboard", status: "available", surface: "drawer",
     access: "permission", permissionKey: "manage_soundboard",
     blurb: "Play clips and blast them to the whole group." }
   ```
   - `access: "permission"` → the only registry control is group on/off; operator visibility is the `permissionKey` grant. Do NOT add to `FEATURE_ROUTES`; exclude permission-gated features from `buildEventNav`'s pinned/launcher output so non-operators never see board UI.
2. **Group enable** = the registry row on/off. In `/admin/features`, render permission-gated features as an **Enabled / Off** switch + a "Manage who has access" link. Enabling also activates the receiver half for all members.
3. **Mount the provider** in the event layout whenever the group is enabled. Inside, the receiver runs for everyone (minus opt-outs); the trigger + drawer render only for operators (`isAdmin || hasPermission(user, "manage_soundboard")`).
4. Add a `"soundboard"` icon to `FeatureIcon` (or temporarily reuse `"music"`).
5. Add `manage_soundboard` to the v2 permissions catalog. Document that for this feature the permission gates **visibility + use + contribute**, not just management.
6. **Grant UI:** per-member `manage_soundboard` toggle in the existing Members permission editor (and/or an access list reachable from the Features row).

## Edge cases

1. **Passive-receiver audio unlock** — members who never tap the board still need a gesture to hear blasts; the global one-time `AudioContext` unlock on first app interaction covers it. Backgrounded/locked devices can't play — document in a help note.
2. **Receiver must be mounted to hear** — the subscriber lives in `SoundboardProvider` in the layout, live for all members, not only inside an open drawer.
3. **Opt-out respected client-side** — a member with `receive_soundboard_blasts=false` still receives the broadcast event but suppresses playback. (Fine; payload carries no private data.)
4. **Grant revoked mid-session** — a demoted operator keeps the trigger until reload, but every write re-gates server-side, so they can't act.
5. **Tag consistency** — `UNIQUE(org_id, lower(name))` blocks dup spellings; rename updates once; deleting a tag cascades its mappings (sounds just lose that tag).
6. **Overlapping taps** — allow layering via separate `AudioBufferSourceNode`s; cap concurrent voices to avoid chaos.
7. **Hard delete** — cascades play history + counters + tag mappings for that sound; confirmed via `ConfirmModal`.
8. **Storage cleanup** — delete removes audio + image objects, not just the row.
9. **Counter drift** — `play_count` / `v2_sound_user_plays` are caches; `v2_sound_plays` is source of truth, reconcilable.
10. **Clip length** — enforce via size limit + guidance (duration not cheaply validated server-side).
11. **Silent switch** — iOS hardware mute can silence Web Audio; note in help.
12. **Spectator** — interactive/personalized → exclude from `/spectator`.
13. **Simulator** — plays logged under effective user id.
14. **Cross-group sharing (future)** — keep `org_id` as owner; add a nullable origin ref later. Don't build now; schema stays forward-compatible.

## Build phases

1. **Schema + wiring** — migrations (sounds, tags, tag_map, plays, user_plays, RPC, bucket, opt-out pref), catalog entry (+ `access`/`permissionKey`), `manage_soundboard` permission, FeatureIcon; exclude permission-gated features from the generic launcher.
2. **Admin + settings** — group enable toggle, per-user operator grant, member "Hear soundboard blasts" opt-out on the settings screen.
3. **Provider shell** — `SoundboardProvider` in the layout: receiver half (channel subscribe + global audio unlock + opt-out gate) for all members; operator trigger + drawer scaffold.
4. **Fast drawer** — Web Audio preload/decode, grid, tag-first nav (filter/group/search, all client-side), "my most played" + "most played" quick lists, tap-to-play (optimistic counters + RPC).
5. **Contribute (same drawer)** — signed-URL audio + image upload, emoji picker, tag assignment + tag vocabulary management, edit/delete/reorder.
6. **Broadcast** — blast toggle, send + receive + rate limit + optional toast.
7. **Stats** — "top blaster" per sound from history.
8. **Polish + docs** — spectator exclusion, README section, v2 design-guide note, verification checklist.

## Acceptance criteria

- [ ] Admin enables the soundboard and grants a member operator access; that member sees the trigger, a non-operator sees no board.
- [ ] An operator adds a sound (audio + emoji/image + tags) from the drawer; it appears for all operators.
- [ ] Tapping a tile plays instantly (pre-decoded buffer); group + personal counters increment; a history row is written.
- [ ] Tag chips filter/group the board with no network round-trip; search narrows by name.
- [ ] "My most played" and "Most played" quick lists are present and reach a sound in one tap.
- [ ] With "Blast to group" on, the clip plays on every member's device app-wide (after their first app gesture), including non-operators.
- [ ] A member who turns off "Hear soundboard blasts" stops hearing them; others still do.
- [ ] Tag names stay consistent (no dup spellings); renaming a tag updates it everywhere.
- [ ] Hard delete removes the row + storage objects + mappings via `ConfirmModal`.
- [ ] Revoking operator access blocks writes immediately (server-gated) and removes the trigger on next load.
- [ ] Opening/closing the drawer never navigates away from the current page.
- [ ] Not shown on `/spectator`.
