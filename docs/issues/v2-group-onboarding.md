## Summary
New-group onboarding. Today `/new/create` collects name + logo + color, creates the org,
makes you owner, and **drops you at the group home with "No active event"** — every next
step (settings, features, members, first event) is manual and undiscovered. This adds a
guided first-run so a brand-new group knows what to do next.

## Approach (chosen: home checklist)
An admin-only **"Get your group ready"** card on the group home, above the event hero.
Progress bar + `X/5`, each unfinished step deep-links to the real admin surface.
Dismissible (per-org) and **auto-hidden once every step is done** — never traps the admin,
resumable, and doubles as the fix for the weak empty state. (Chosen over a forced wizard.)

Steps (completion derived from real data — no per-step flags to sync):
1. **Name your group** — always done (org exists).
2. **Add a logo & colors** — `logo_url` set → `/admin/settings`.
3. **Create your first event** — org has ≥1 event → `/admin`.
4. **Turn on the features you want** — an org-default `v2_event_features` row exists → `/admin/features`.
5. **Invite your members** — ≥1 invite sent OR a 2nd member joined → `/admin/members`.

## Implementation (shipped)
- **Migration 00233** — `v2_organizations.onboarding_dismissed_at` (per-org dismissal).
- **`src/lib/v2/onboarding.ts`** — `getOnboardingState()` computes step completion + `show`.
- **`OnboardingChecklist.tsx` + `.module.css`** — the card (v2 tokens, 400px column).
- **Home page** (`(event)/page.tsx`) — renders it for admins when not done/dismissed.
- **`PATCH /api/v2/orgs/[id]`** — accepts `onboarding_dismissed` → stamps/clears the column.

## Follow-ups (not in this pass)
- In-card actions (create the event inline instead of deep-linking) if the deep-link
  round-trip feels heavy.
- A "you're all set 🎉" one-time confirmation when the last step completes.
- Revisit whether **member** creators (non-admins who somehow create) ever see it — today
  it's strictly owner/admin.

Part of the Group admin epic (#175).
