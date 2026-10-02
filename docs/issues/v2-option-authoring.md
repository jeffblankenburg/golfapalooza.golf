# v2: option authoring — full v1 parity (OptionBuilder rebuild)

Part of #214, expands #216. The options work in #216 shipped the simplest corner only (one `checkbox` option whose price = sum of bundled cost_items). v1's option authoring is a full subsystem (`OptionBuilder.tsx`, ~1,500 lines) structured **Groups → Options → Choices** with per-choice cost + contest linking, dependencies, 7 types, icons, and an open/closed deadline. This issue rebuilds v2 options to mirror it. Decision (2026-10-01): **full v1 parity, rebuild to v1 shape** — slice-1's cost-bundling becomes the `checkbox` case.

## The v1 model we're matching
`option_groups` (sections) → `trip_options` (7 types) → `choices` (JSONB, per-choice cost + contest). Cost-items link *into* options (per choice via `cost_item_option_choices`), not the reverse. Plus dependencies, required/limits, icons, markdown, drag-order at 3 levels, and a selection deadline + open/closed. Reference: `src/components/admin/OptionBuilder.tsx`, `CostItemLinksModal.tsx`, `src/lib/option-icons.tsx`, `src/lib/cost-items/compute.ts`, `option-contest-sync.ts`, migrations `00071/00072/00073/00076/00115/00138/00139/00146-7`.

## Schema (rebuild to v1 shape)

**`v2_option_groups`** (new) — `id, org_id, event_id, name, description, icon, sort_order`.

**`v2_options`** (expand) — add:
- `group_id UUID → v2_option_groups`
- `option_type` CHECK → `checkbox | select | multi_select | quantity | text | number | trip_cost`
- `choices JSONB` — `[{label, value, cost?, contest_id?}]` (value auto-slugged from label)
- `is_required BOOLEAN`, `max_total INTEGER` (quantity cap)
- `icon TEXT`, `depends_on_option_id UUID → v2_options`
- keep `name, description (markdown), sort_order`

**`v2_cost_item_option_choices`** (new junction) — `cost_item_id, choice_value` (which cost_item funds which choice). Empty rows → applies to the whole option (checkbox) / default.

**`v2_user_option_selections`** (expand) — add `value JSONB` (true | "choiceValue" | ["v1","v2"] | {choice: qty}); presence alone is no longer enough for multi-choice types.

**`v2_event_option_settings`** (new) — `event_id PK, selection_deadline, is_open`.

## Pricing + enrollment (per type)
- **Price derivation** (ports `compute.ts`): checkbox = SUM(linked cost_items with no choice rows); select/multi_select/quantity = per-choice SUM of cost_items matching that choice via the junction; quantity total = Σ(choice cost × qty); `trip_cost` = SUM(included_in_trip_cost).
- **Contest enrollment** (ports `option-contest-sync.ts`): selecting a choice enrolls into the contests whose funding cost_items map to that choice value (per-choice), plus any whole-option link. Deselect removes.
- Member charges stay **derived** (the #216 decision) from selections × current prices; the ledger still stores only payments/manual.

## Admin UI — OptionBuilder (ports `OptionBuilder.tsx`)
A dedicated builder at `/new/[slug]/admin/events/[eventId]/options`:
- **Settings bar**: selection deadline + Open/Closed toggle.
- **Groups**: add/rename/icon/delete, drag-reorder, collapse/expand.
- **Option form** (per option): name, icon picker, markdown description, **type dropdown** (7), **choices editor** (drag-reorder rows; label auto-slugs value; cost read-only "derived from linked cost items"; delete/add), `max_total` (quantity only), **Required** toggle, **Depends on…** picker, Save/Delete.
- **Cost-item linking modal** (ports `CostItemLinksModal.tsx`): per-choice toggles mapping cost_items → choices, with running per-choice totals; items linked elsewhere greyed.
- Drag-reorder at group / option / choice levels.
- **Icon library** (port `option-icons.tsx`, ~80 icons / 11 categories) shared by groups + options.

## Member UI (ports the member selection render)
Render each type on the event home Options module: checkbox toggle, select (radio/dropdown), multi_select (checklist), quantity (steppers w/ max), text/number inputs, trip_cost (read-only line). Respect groups, required, dependencies (hide child until parent selected; clear on deselect), and open/closed (lock when closed/past deadline). One line per option with its price; never the contests inside.

## Phases
- **A — structure + core types**: schema (groups, types, choices, deps, required, icon, settings), OptionBuilder (groups + option form + choices editor + icon picker + markdown + drag order), member render for checkbox/select/multi_select. Whole-option cost (slice-1 behavior) still works.
- **B — per-choice cost + contest linking**: `v2_cost_item_option_choices` + CostItemLinksModal + per-choice price derivation + per-choice contest enrollment.
- **C — advanced**: quantity (+max_total) & text/number types, `depends_on_option_id` cascade, selection deadline + open/closed enforcement.

## Migration note
Rework `v2_options` in place (it only has slice-1 test data). `v2_user_option_selections` gains `value` (default `'true'` for existing checkbox rows).

## Non-goals (for now)
Audience/visibility targeting on options (reuse announcements model later if needed); member-specific admin-set options.
