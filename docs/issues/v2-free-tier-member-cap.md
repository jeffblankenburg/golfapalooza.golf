## Summary
Pricing model for the v2 platform: **creating a group is free, and using the features is
free, as long as the group has 4 or fewer members** (one admin + three others). Beyond 4
members the group must be on a paid plan (**price TBD**).

The point is a real, no-friction trial: anyone can spin up a group, configure it, and try
the features hands-on with a few people before deciding to invite their whole family /
crew and pay.

## The rule
- **Free tier:** up to **4 active members** total. Typically 1 owner/admin + 3 members,
  but the cap is on the total headcount, not the role split.
- **Paid tier:** 5+ members. Price not yet decided.
- Free groups keep **all features** — the cap is on people, not functionality. (No feature
  gating in the free tier; that keeps the trial honest.)
- Applies per **organization** (`v2_organizations`). A user can be a free member of many
  groups.

## Enforcement (design — NOT yet built)
The single chokepoint is **adding the Nth member**:
- **Invite acceptance** — `POST /api/v2/invites/[code]/accept` must refuse to create the
  membership when it would push an unpaid org past 4 active members (return a clear
  "this group is full on the free plan" error the join page can surface).
- **Invite creation** — `POST /api/v2/orgs/[id]/invites` should warn/soft-block when the
  org is already at the cap on the free plan (better UX than failing at redemption).
- **Removals free up slots** — leaving/removing a member drops the active count, so a
  free group can churn members as long as it stays ≤4 at any moment.
- Count = `v2_memberships` where `status='active'` for the org.

Needs a paid/plan signal on the org — e.g. `v2_organizations.plan` (`'free' | 'paid'`) or
a `member_limit` (default 4, raised when paid). Billing integration is a separate,
later piece; for now the flag can be set manually so the cap is enforceable before
payments exist.

## Ties to onboarding (#196)
This is the "try before you commit" half of the funnel that the onboarding checklist
(#196) sets up: create → configure → try with a few people (free) → invite everyone (paid).
The checklist's "Invite your members" step is where a group naturally bumps the cap, so
that's a good place to introduce the upgrade prompt later.

## Open questions
- **Price** — the actual number(s) / cadence (flat per group? per member? annual?).
- **Billing provider** — Stripe or a marketplace integration (out of scope here).
- Does an admin count toward the 4, or is it "admin + 3 others = 4 others + admin = 5"?
  Current assumption: **4 total, admin included** (1 admin + 3 = 4).
- What happens to an over-cap group if a paid plan lapses (grandfather vs. lock writes)?

Part of the platform roadmap (#177). Group admin epic (#175).
