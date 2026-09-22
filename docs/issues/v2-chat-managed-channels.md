## Summary
Two special chat channels from v1 were flattened into ordinary group rooms during the v2
import and lost their automatic membership:

1. **All-members channel** ("All Loozers") — a permanent group channel that **always
   includes every active member** of the group. New members are auto-added; nobody can
   leave, rename, or manage it.
2. **Event channel** ("Golfapalooza XXX") — a permanent channel tied to an event that
   **always includes everyone opted into the event**. Opt in (RSVP "Attending") → auto-added
   with full history; opt out → the channel disappears from your list, but **your past
   messages persist**.

## Model (shipped)
- **`v2_chat_rooms.room_kind`** (migration 00237): `regular` | `all_members` | `event`.
  Regular = user-created group/DM (default). Managed = the two above. Partial unique
  indexes enforce one `all_members` per org and one `event` room per event.
- Membership stays **materialized** in `v2_chat_room_members` (so unread/pins/receipts/
  realtime all work unchanged) and is kept in sync from the app layer.
- `src/lib/v2/chat/channels.ts`: `ensureAllMembersRoom`, `addToAllMembers`,
  `removeFromManagedChannels`, `ensureEventRoom`, `syncEventChannelMembership`.

## Sync hooks
- **All-members**: seeded on org create (`/api/v2/orgs`) and invite accept
  (`/api/v2/invites/[code]/accept`); a member is dropped on **archive** and re-added on
  **restore** (`PATCH /api/v2/orgs/[id]/members`). Archived members are excluded.
- **Event**: channel auto-created when an event is created (`POST /api/v2/orgs/[id]/events`);
  membership synced on RSVP — `likelihood===99` (on_roster) adds; anything lower or a
  cleared RSVP removes (`POST`/`DELETE /api/v2/events/[eventId]/rsvp`). Removal keeps messages.
- **Backfill** (00237): marks the imported "All Loozers"/"Loozers" system room (v1 system
  rooms have `created_by IS NULL`), ensures every org with members has an all-members channel
  and syncs it, and creates an event channel for each **active** event seeded from its roster.

## UI + guards
- The room-settings gear (rename/add/remove/leave from #192) shows only on `regular` group
  rooms. Managed channels have no settings.
- API blocks rename / leave / add / remove on any non-regular room (`room_kind` guard in the
  room + members endpoints), so managed membership can't be hand-edited.

## Notes / decisions
- **Opt-out deletes the membership row** (matches v1 `cascadeRemoveFromRoster`); messages
  key off `sender_id`, so history is untouched and re-opt-in restores full access.
- Historical imported event rooms (past "Golfapalooza XXX") are **left as regular rooms** —
  only **active** events get a managed channel (fuzzy-linking old rooms by name was too
  risky). They can be linked by hand later if desired.
- Generic orgs name the channel **"All {member_noun_plural}"** (Golfapalooza → "All Loozers").

Follow-up to #192. Part of the Community epic (#172).
