# Feature: Live Scoring Realtime Sync

## Overview

When two players in the same group both have the live scorer open on their phones, edits on one device should propagate to the other within a second. Today, the live scorer is single-writer: it auto-saves to `/api/rounds/{id}/scores`, but other devices viewing the same round have to refresh to see updates. That breaks the "we're all scoring this together" UX — and worse, two devices can write conflicting scores with no awareness of each other.

This issue subscribes the live scorer to Supabase Realtime channels keyed on `round_id`, listening to changes on `round_scores` and `round_players`. Conflict resolution is **last-write-wins** based on server timestamp.

Depends on issue #3 (co-equal ownership) — without co-equal ownership, only one device can write anyway, so realtime sync is moot.

## Design

### Channel structure

One Supabase Realtime channel per active round, named `round:{round_id}`. The live scorer subscribes on mount and unsubscribes on unmount. The channel listens to:

- `INSERT` / `UPDATE` / `DELETE` on `round_scores` WHERE `round_id = $1`
- `INSERT` / `UPDATE` / `DELETE` on `round_players` WHERE `round_id = $1`

Supabase's PostgREST Realtime supports row-level filters via the `filter` option on `postgres_changes`.

### Wire-up

In `LiveScoringEntry`:

```ts
useEffect(() => {
  if (!roundId) return;
  const client = createSupabaseBrowserClient();
  const channel = client
    .channel(`round:${roundId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "round_scores", filter: `round_id=eq.${roundId}` },
      handleRemoteScoreChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "round_players", filter: `round_id=eq.${roundId}` },
      handleRemoteRosterChange,
    )
    .subscribe();
  return () => { client.removeChannel(channel); };
}, [roundId]);
```

### Last-write-wins merge

The crucial bit: when a remote change comes in for a hole the local user is **also editing**, we don't blow away their pending edit. The merge rule:

1. If the hole has a pending dirty write in `dirtyRef`, **ignore** the remote change. Our own flush will win on next save (and the next remote echo will tell us so).
2. Otherwise, replace the local state for that hole with the remote value.

This means the *last write to land on the server* wins, with the caveat that a user actively typing a score is treated as "still writing" until the debounce flushes. That's the natural UX: your typing isn't interrupted by someone else's keystrokes mid-stroke.

### Roster changes

When a `round_players` INSERT lands, the live scorer adds the player to its `playerMap` and renders them in the roster. When a DELETE lands, the player vanishes (and if the deleted player is the current user, the scorer redirects to `/my-rounds` with a toast: *"You were removed from this round."*).

### Connection state

A small *"Live"* / *"Reconnecting"* badge in the header indicates the realtime channel's status. Uses Supabase's `SUBSCRIBED` / `CHANNEL_ERROR` / `CLOSED` lifecycle events. While disconnected, the scorer continues to save (writes are queued and flush on reconnect, same as offline today).

## Data Model

### RLS

Realtime subscriptions on `round_scores` and `round_players` are gated by the same RLS policies as `SELECT`. Current `round_scores` SELECT policy: scores in your rounds. That works — any player in the round can read all scores via `is_round_player(round_id)` (or via the existing scorer policy). Verify this is true before shipping; if not, add a permissive SELECT policy for round players.

### Realtime publication

Both `round_scores` and `round_players` must be added to the `supabase_realtime` publication. Migration:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE round_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE round_players;
```

## Surface Area

### Files

- `src/lib/realtime/round-channel.ts` — new helper `subscribeToRound(roundId, handlers)` returning an unsubscribe fn. Encapsulates channel creation, event routing, and lifecycle.
- `src/components/my-rounds/LiveScoringEntry.tsx` — wire the subscription; implement the dirty-aware merge.
- `src/components/scoring/ScoringShell.tsx` — render the Live/Reconnecting badge in the header (optional but a nice signal).
- `supabase/migrations/00156_realtime_rounds.sql` — add tables to `supabase_realtime` publication.
- `CLAUDE.md` — document the channel naming convention and the merge rule.

### Performance

- Channels are per-round, so total open subscriptions = number of active live scorers. Bounded by group size, not total user count.
- A round has at most 4 players × 18 holes = 72 scores. Even if all four players score every hole, that's 72 events per round lifecycle — trivial.
- Unsubscribe on unmount is essential. The `useEffect` cleanup handles it; verify no leaks in StrictMode double-mount.

## Edge Cases

- **Simultaneous edit of the same hole**: A scores hole 5 = 4. B scores hole 5 = 3 a moment later. Both flushes hit the server. The later one wins (server timestamp). The first writer's local state is updated by the realtime echo of the second write — they see "4 → 3" appear. Acceptable.
- **Echo of own writes**: When a user's own flush lands, the realtime channel will echo the change back. The merge logic must detect this is the local user's own write (or, simpler: the merge is idempotent — applying the same value over your local state is a no-op).
- **Stale subscription after roundId change**: `LiveScoringEntry` lifecycle ties subscription to `roundId` via `useEffect` deps. Changing roundId tears down the old channel and opens a new one.
- **Auth expiry**: if the user's session expires mid-round, the realtime channel disconnects. Show *"Reconnecting"* and reconnect on session refresh.
- **Removed mid-round**: per issue #3, a player can remove another. The realtime DELETE on `round_players` triggers the "you were removed" redirect if the deleted row is the current user.
- **Round completion**: when a co-player completes the round (status → `completed`), do we need realtime sync of the `rounds` row? Likely yes — add `rounds` to the channel too, listen for status changes, and show a toast + redirect on completion. **Adding to scope.**

## Out of Scope

- Realtime sync on the round **detail** page (`/my-rounds/rounds/{id}`) — that's a static view, refresh-to-update is fine.
- Realtime sync on the rounds **list** (`/my-rounds`) — list updates can wait for navigation.
- Presence indicators (*"Randy is also scoring"*) — possible follow-up but adds complexity (presence channels, idle timeouts).
- Cursor / per-hole "Randy is on hole 7" — same.

## Acceptance Criteria

- [ ] Two devices viewing the same live scorer see each other's hole edits within ~1 second.
- [ ] Conflicting edits resolve to last-write-wins by server timestamp.
- [ ] Locally dirty holes are not overwritten by remote echoes until the local flush completes.
- [ ] Adding a player mid-round shows them on other devices without refresh.
- [ ] Removing a player mid-round removes them on other devices; removed user is redirected.
- [ ] Completing the round from one device redirects other devices to `/my-rounds` with a toast.
- [ ] Live / Reconnecting status visible in the live scorer header.
- [ ] Migration `00156_realtime_rounds.sql` adds the right tables to the `supabase_realtime` publication.
- [ ] CLAUDE.md updated.

## Verification Checklist

1. **Two-device sync**: User A on device 1 and User B on device 2 both open the same live scorer. A enters hole 3 = 4 → B sees `4` appear in <1s.
2. **Last-write-wins**: A enters hole 5 = 4, then a moment later B enters hole 5 = 3. End state on both devices: `3`. Server has `3`.
3. **No mid-typing overwrite**: A is in the middle of typing hole 7 (dirty in `dirtyRef`). B sends hole 7 = 5. A's input is not overwritten; A's value flushes and wins.
4. **Roster sync — add**: A adds Player C → C appears in B's roster strip without refresh.
5. **Roster sync — remove**: A removes Player C → C disappears in B's roster strip.
6. **Self-removed redirect**: A removes B → B's device shows the toast and redirects to `/my-rounds`.
7. **Completion sync**: A taps Complete Round → B's device shows a toast ("Round completed by A") and redirects to `/my-rounds`.
8. **Reconnect**: Disable network on device 1 → "Reconnecting" badge appears. Re-enable → "Live" returns, queued writes flush.
9. **No leaks**: Open and close the live scorer 10 times. Confirm no growing channel count via the Supabase dashboard.
10. **Sim mode**: Admin in sim mode opens the live scorer for a simulated user. Realtime works (and doesn't broadcast to the real user's devices since the simulating admin is the only client).
