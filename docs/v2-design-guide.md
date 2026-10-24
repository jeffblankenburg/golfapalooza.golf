# v2 Design & Interaction Guide

The canonical "how should this look / behave" reference for the v2 app (`/new`).
Example-first: copy the snippet, don't re-derive the convention. When a new "this
is the consistent way" decision is made, add a line here.

Scope: the v2 platform under `src/app/new/**`, `src/components/v2/**`, styled with
`src/app/new/new.module.css` (and a few feature-local modules like
`SquaresAdmin.module.css`). The legacy app is out of scope.

Related: terse rules also live as memory notes (no em dashes, no middot separators,
delete gets its own button, give content breathing room, `/new` column is 400px or
full-screen). This doc is the authoritative, example-bearing version for visuals.

---

## Forms & inputs

### Money inputs — the `$` goes INSIDE the box

Never a `$` sitting to the left of the field. Absolute-position it inside, pad the
input left. Applies to every currency field (entry fee, buy-in, price per square…).

```jsx
<span style={{ position: "relative", display: "block" }}>
  <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
                 color: "var(--ink-soft, #59635b)", pointerEvents: "none" }}>$</span>
  <input className={styles.input} style={{ paddingLeft: 26 }} inputMode="decimal"
         value={fee} onChange={...} />
</span>
```

- `left`/`paddingLeft` scale with the input's own padding (26 for the 14px-padded
  `.input`; ~22 for the tighter `.cost input`).
- Include the `#59635b` fallback on the color — portaled modals (see below) render
  outside the theme scope where `--ink-soft` isn't defined.

### Selects — use `.selectInput`, never `.input`

A `<select>` with `.input` renders the **native** caret jammed at the far right.
Use `.selectInput` (it sets `appearance: none` + a custom inset chevron and matches
`.input`'s border/radius).

```jsx
<select className={styles.selectInput} value={v} onChange={...}>…</select>
```

GOTCHA that cost us a long detour: **CSS modules are per-file.** `styles.selectInput`
only works if `.selectInput` exists in the module *that component imports*. Several
feature modals import a local module (e.g. `SquaresAdmin.module.css`) that didn't
have it — `styles.selectInput` silently resolved to `undefined` and the select went
unstyled. Before switching a select to `.selectInput`, confirm the class exists in
the right module (or add it, mirroring that module's `.input`).

### Text inputs & labels

- Text/number input: `.input`. Label above it: `.label`.
- Optional/hint text next to a label: `<span className={styles.optional}>(…)</span>`.

### Inline save status — don't push layout down

A "Saved" / "Saving…" indicator goes **right-aligned on the field's title row**,
not as a new line beneath it.

```jsx
<div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
  <label className={styles.label}>Who's collecting? <span className={styles.optional}>(needs Venmo)</span></label>
  {status !== "idle" && <span className={styles.optional}>{status === "saving" ? "Saving…" : "Saved"}</span>}
</div>
```

---

## Save semantics — forms vs. pages

The one rule that keeps editors consistent:

- **Form / modal with a Save button** → *every* field persists on Save. Nothing
  inside the form auto-saves. (Heavy editors like the Squares pool editor need a
  batched Save; a lone auto-saving field creates the "I hit Cancel but that one
  field stuck" bug.)
- **Page with no Save button** → auto-save on change, with a subtle inline status.

Shared components that live in both contexts (e.g. `ContestCollector`) take a
**controlled mode**: pass `value` + `onChange` to have the host form own/save the
value; omit them for standalone auto-save.

---

## People / collector pickers

- **Pre-select the active user** — never an abstract "creator / treasurer (default)"
  option. (`ContestCollector`, `GroupContestMoney` both do this.)
- **Venmo-gate** — `disabled` any member without a Venmo handle (they can't be paid).
- **Respect name-display mode** — render names via `pickName(member, nameMode)`, never
  `display_name` directly. Server code resolves mode with `orgNameMode(admin, orgId)`;
  client components receive `nameMode` as a prop (from `org.name_display`).

---

## Icons & type badges

- **Pick'em** = solid box + white check. **Squares** = outlined grid box.
- Keep them the **same visual size**: a stroked box's 2px stroke straddles the edge
  (~1px beyond each side), so a filled box needs the *same* `stroke` to match bounds.

```jsx
// Pick'em
<rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" stroke="currentColor" strokeWidth={2} />
<path d="M8 12l2.5 2.5L16 9" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
```

---

## CSS / theming gotchas

- **CSS modules are per-file** — a class must exist in the module the component
  imports. Don't assume `new.module.css` classes are available in a feature-local
  module's `styles`.
- **Portaled modals render outside `.wrap`** — components mounted via `createPortal`
  (e.g. the Squares editor) sit outside the themed wrapper, so CSS custom properties
  defined under `.wrap` (`--ink-soft`, `--ink`, `--line-strong`) may not resolve.
  Use `var(--x, #fallback)` for colors there, and prefer classes that already carry
  fallbacks.
- **Inline styles are the reliable fallback** when a CSS-module class is flaky or
  missing, but prefer a shared class for anything reused (inline the one-offs:
  positioning, a single padding tweak).

---

## Layout & chrome

- **Content column**: `/new` layouts are either a 400px column or full-screen —
  nothing in between.
- **Breathing room**: always leave margin/padding around content; cramped spacing
  gets flagged.
- **Nav z-index**: `HeaderBar` + `BottomNav` are reserved at `z-[60]`; modals stay
  at `z-50` and below. Navs are never covered.
- **Dialogs**: use the shared `ConfirmModal` — never `window.confirm/alert/prompt`.
- **Destructive actions**: a real destructive button (`.deleteBtn`, its own row) +
  `ConfirmModal`, never a text link next to Save.

---

## Text conventions

- No em dashes (—) in displayed UI text; use commas, parens, or hyphens.
- No middot `·` (or any dot) as an inline separator; use commas / parens / dashes.
- The squares-grid contest is "**Squares**" everywhere (never "Boxes") — UI, URLs,
  and the `contest_type` value.

---

## Money / number formatting

Whole dollars drop the cents; fractional dollars show two places.

```js
const money = (cents) => `$${(cents / 100).toLocaleString("en-US", {
  minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
```
