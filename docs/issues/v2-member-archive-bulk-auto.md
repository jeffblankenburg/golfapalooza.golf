**Priority: low.** Nice-to-haves on top of the shipped archived-members feature (#198).
Not needed now — filed so they aren't lost.

## Bulk archive
Archiving is currently one member at a time via the admin Members edit drawer. For a group
with decades of one-time attendees, retiring many at once is tedious. Add a multi-select on
the admin roster (checkboxes → "Archive selected" / "Restore selected"), reusing the same
owner-guard rules and the `PATCH /api/v2/orgs/[id]/members { archived }` path (batched).

## Auto-archive suggestion
Surface archive candidates instead of making admins hunt: members with **0 events attended
in the last N years** (or never attended) get a subtle "suggest archiving" affordance in the
admin roster. Purely a suggestion — admin still confirms; never auto-applies.

## Notes
- Both build on the existing model (`v2_memberships.archived_at`, orthogonal to role/status;
  archived blocks access). No schema change expected.
- Related: the #197 free-tier member cap should likely NOT count archived members.

Part of the members work (#198) / Community epic (#172).
