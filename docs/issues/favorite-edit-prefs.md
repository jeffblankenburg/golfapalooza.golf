# Feature: Re-edit notification prefs for an existing favorite

**Follow-up to #140 (Favorite Loozers).**

## Background

In #140 the favorite star became a simple toggle:
- **Empty star → tap** opens the "Following {Name}" drawer, favorites them (all notifications on by default), and lets you pick which notifications you want.
- **Gold star → tap** instantly unfavorites and clears all their notifications — no drawer.

That's the desired quick-toggle behavior, but it has a gap: once someone is favorited, **there's no way to re-open the drawer to change just some notification toggles** (e.g. turn off Hole-by-Hole but keep Rounds Played). Today you'd have to unfavorite and re-favorite (which resets prefs to all-on).

The per-favorite prefs already exist end-to-end — `user_favorites.notify_round_started / notify_hole_completed / notify_round_completed`, the `PUT /api/favorites/{favoriteUserId}` endpoint, and `updatePrefs()` in `FavoritesContext`. This issue is purely about adding a UI entry point back to the editing drawer without sacrificing tap-to-unfavorite.

## Options (pick one)

1. **Long-press the gold star** → opens the drawer; tap still removes.
   - Pro: no extra chrome. Con: undiscoverable on mobile; needs a press-timer + touch handling.
2. **Small gear/bell icon next to the gold star** → opens the drawer; star tap still removes.
   - Pro: discoverable, explicit. Con: adds a second control next to the star (tight on `/loozers` grid cards).
3. **"Favorites" management screen** listing all favorited Loozers with per-row notification toggles (+ unfavorite).
   - Pro: a proper home for managing favorites; scales well. Con: most work; new route/page.

Recommendation: **Option 3** as the durable answer (a real management surface), optionally with Option 2 on the profile page where there's room. Grid cards stay tap-to-toggle only.

## Acceptance criteria

- [ ] An existing favorite's notification toggles can be changed without unfavoriting.
- [ ] Tap-to-unfavorite on the gold star still works everywhere it does today.
- [ ] Editing persists via `PUT /api/favorites/{favoriteUserId}` and reflects across all stars (shared `FavoritesContext`).
- [ ] Works at all font-scale settings and doesn't crowd the `/loozers` grid cards.
- [ ] README updated if a new management screen/route is added.

## Notes

- Reuse `FavoritePreferencesDrawer` for options 1–2; it already handles the edit case (it just isn't reachable for existing favorites anymore).
- For option 3, a new `/favorites` (or a section under the profile/settings) backed by `GET /api/favorites`.
