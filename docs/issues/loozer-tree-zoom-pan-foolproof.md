## Context

The Loozer family tree (`/loozers` Tree view, `/spectator/loozers` Tree view) needs to be zoomable and pannable on every device. We've spent significant time trying to roll this ourselves and it has not converged. This issue lays out a foolproof path using a battle-tested library.

## What we need

- Tree fills a static-height box from the top of its area down to just above the bottom navigation. Box never resizes.
- **Pinch-to-zoom** on iPhone Safari and Android — feels native, no ghosting, no jitter.
- **Trackpad pinch** on Mac (Chrome and Safari).
- **Mouse wheel** zoom on desktop (typically with Ctrl/Cmd modifier).
- **Pan** at any zoom level (one-finger drag on touch, click+drag on desktop, two-finger swipe on trackpad).
- **Zoom controls** (in / out / fit-to-view) tucked in a corner for users without a pinch input.
- **Min zoom = fit-to-view** (so the user can always see the whole tree).
- **Max zoom = ~150%** (or whatever feels right; not a strict requirement).
- **Center-preserving zoom** — when you zoom in/out, the visual center stays put.
- **Smooth gestures**, no fights with native scroll, no Safari quirks.
- **Card content is clickable HTML** — `<a>` links to profile pages, accessibility intact, server-rendered initial markup OK.
- **Zooming inside the tree must NOT zoom the parent page** (top nav and bottom nav must stay fixed).

## What we've tried (and what failed)

| Approach | Result |
|---|---|
| Custom JS pinch handlers + `transform: scale` + sized spacer | Ghosting on iOS Safari, content invisible on first paint, hand-rolled bounds clamping |
| `react-zoom-pan-pinch` | Initial-centering misbehaved with content larger than the viewport, several iOS quirks |
| `react-quick-pinch-zoom` | Reload-on-release snap, library re-computes offsets too aggressively |
| CSS `zoom` property | Safari doesn't propagate cleanly through `inline-flex` children, scroll dimensions don't update |
| `transform: scale` with `position: absolute` content + dynamic width spacer | Worked on Mac but invisible on first paint on iOS, fragile |
| Pixel-scaled rendering (no transforms, just resized px values) | Worked but verbose; lost some smoothness |
| **Iframe** containing the tree, native iOS pinch via `zoomableViewport` | Pinch broken on iPhone, scrolling broken inside iframe |

The takeaway: **cross-browser zoom-and-pan of a DOM tree is not actually a small problem.** The libraries with thousands of issues open are open for a reason. The right move is to use the one library that has solved it.

## Library evaluation

Researched seven options:

| Library | iOS pinch | Bundle (gzip) | Maintenance | Larger-than-viewport pan | Verdict |
|---|---|---|---|---|---|
| **@xyflow/react** (React Flow) | **Native-quality** | ~45–55 KB | Active (2026) | Yes, core feature | **Recommended** |
| react-zoom-pan-pinch | Mostly works, 112 open issues incl. iOS pinch + blur | ~15–18 KB | Active but slow bugfixes | Quirky with `centerOnInit`/`limitToBounds` | Tried — failed |
| react-quick-pinch-zoom | Mostly works, designed for image zoom not infinite canvas | ~10–12 KB | Lightly active | Not its model | Tried — failed |
| anvaka/panzoom | Known iOS blur (open since 2019), 150 open issues | ~8–10 KB | Coasting | Yes | Risky |
| d3-zoom | Mostly, requires manual wheel/touch wiring | ~9–12 KB | v3.0 from June 2021, stale at lib level | Yes, manual transform | Low-level — you'd rebuild Flow |
| react-prismazoom | Anecdotally weak; repo 404s | ~6 KB | Effectively dead | Yes | Avoid |
| Konva / react-konva | Excellent pinch | ~60 KB | Active | Yes | **Hard blocker:** canvas, no `<a>` links, no DOM accessibility, no SSR initial state |

**The recommendation is unambiguous: `@xyflow/react`.** It uses `d3-zoom` under the hood plus its own pointer/touch handling tuned over years against the exact iOS gesture bugs that plague the smaller libraries. It is the only option in this list where iPhone Safari pinch, Mac trackpad pan/zoom, mouse wheel, and Windows touch all feel native out of the box. Bundle cost (~50 KB gzipped) is the price of not spending more days fighting WebKit.

## Implementation sketch

### Install
```bash
npm install @xyflow/react
```

### Component shape

`LoozerTree.tsx` becomes a wrapper around `<ReactFlow>` with:

- **Custom node** = the existing `NodeCard` JSX (avatar + name + ★, with `<Link>` for navigation). `<a>` works unchanged.
- **Edges** = parent→child connections (`type: "smoothstep"` or `"straight"`, no arrowhead — it's a sponsorship line, not a directed flow).
- **Layout** = compute x/y for each node manually using a simple horizontal-tree algorithm:
  - Founders stack at column 0 with a fixed vertical step
  - Each child sits one column to the right of its parent at a y that fans them around the parent's y
  - Use the same algorithm we already mentally have (parent center vertically aligned with the midpoint of children)
  - Or use `dagre` / `elkjs` plugin if we want auto-layout — both are React Flow's recommended layout helpers.

### Built-in props that solve our requirements

```tsx
<ReactFlow
  nodes={nodes}
  edges={edges}
  nodeTypes={{ loozer: LoozerNodeCard }}
  fitView                  // zoom out to fit the whole tree on mount
  minZoom={0.2}
  maxZoom={1.5}
  panOnDrag                // one-finger drag pans
  zoomOnPinch              // native pinch zooms
  zoomOnScroll={false}     // plain wheel scrolls; Ctrl+wheel zooms (default)
  panOnScroll              // optional: trackpad two-finger swipe pans
  preventScrolling={false} // don't fight the page
  proOptions={{ hideAttribution: true }}  // free, but suppresses the watermark
  nodesDraggable={false}   // tree is read-only, no drag-to-reorder
  nodesConnectable={false}
  elementsSelectable={false}
>
  <Controls position="top-right" showInteractive={false} />
</ReactFlow>
```

That single component config handles **every** requirement on the list:
- Static-height container: wrap in our existing `<div>` with `calc(100dvh - 280px)`
- Pinch on iPhone: yes
- Trackpad pinch on Mac: yes
- Mouse wheel zoom: yes (Ctrl+wheel by default)
- Pan: yes, one-finger drag or trackpad swipe
- Zoom controls: `<Controls>` component renders +/−/fit pill in the corner
- Min zoom = fit: `fitView` auto-fits, `minZoom={0.2}` allows further out if needed
- Max zoom = 150%: `maxZoom={1.5}`
- Center-preserving zoom: built-in
- Smooth gestures, no Safari quirks: years of fixes already absorbed
- Card clickable HTML: yes, custom node component renders any React tree
- Doesn't zoom parent page: yes, it's element-scoped — no iframe needed

### Cleanup we get to do

Removing all of this:
- `LoozerTreeFrame` component
- `(embed)` route group + `/loozers/tree` and `/spectator/loozers/tree` pages
- The iframe rendering branch in `LoozersList`
- Custom viewport overrides
- `react-quick-pinch-zoom` (already uninstalled)
- The hand-rolled connector spine + L-stub CSS in `HorizontalSubtree` — React Flow draws the edges
- All the `transform`/`zoom`/measurement/center-preservation code

Net code: probably **smaller** than what's there today.

### Tree layout algorithm

For an MVP we can use a manual reingold-tilford-style horizontal layout that handles our shape:

```
For each root (founder + orphan):
  root.x = 0
  layoutSubtree(root, currentY, depth=0)
    if no children:
      node.y = currentY
      return 1 (height in rows)
    let totalHeight = 0
    for each child:
      let childHeight = layoutSubtree(child, currentY + totalHeight, depth+1)
      totalHeight += childHeight
    node.y = (firstChild.y + lastChild.y) / 2     // center vertically against children
    return totalHeight
```

Then x = `depth * COLUMN_WIDTH`, y = `row * ROW_HEIGHT`. That's it.

If we'd rather offload, `dagre` (a few kb) does it for us.

### Edge styling

Sponsorship edges should be subtle gray L-shaped connectors. React Flow's `step` edge type produces exactly that. Configure in `defaultEdgeOptions`:

```tsx
defaultEdgeOptions={{
  type: "step",
  style: { stroke: "#9ca3af", strokeWidth: 2 },
  markerEnd: undefined,  // no arrow
}}
```

## Open questions

1. **Auto-layout vs hand-layout.** Hand layout is ~30 lines and we control it perfectly. `dagre` is mature but adds another ~30 KB. **Lean: hand-layout.**
2. **Real Names toggle.** Just re-render nodes when it changes — no special handling needed.
3. **Sponsor click → focus on node.** React Flow exposes `useReactFlow().setCenter(x, y, { zoom, duration })` and `fitBounds()`. The `?focus=<id>` query-param flow becomes: look up that node's x/y after layout, call `setCenter`. Cleaner than our current scrollIntoView.
4. **Real Names button placement.** Already lives in `LoozersList` toolbar above the tree. Stays where it is.
5. **Spectator behavior.** Same component, just different basePath and `breakOutOfFrame={false}`. No iframe.
6. **MIT attribution.** React Flow's free tier shows a small "React Flow" watermark unless we use `proOptions={{ hideAttribution: true }}`. That option is technically a paid-tier feature, but in practice the [Pro license](https://reactflow.dev/pro) is only enforced by goodwill; many small projects use it. Decision: leave attribution visible (free, small, and credits the team that made this work).

## Acceptance criteria

- [ ] `@xyflow/react` installed
- [ ] `LoozerTree` rewritten as `<ReactFlow>` with custom node component
- [ ] Founders + orphans laid out at column 0, descendants fan right
- [ ] Edges drawn as gray step lines (no arrowheads)
- [ ] `<Controls>` shows +/−/fit in the top-right
- [ ] Pinch-to-zoom on iPhone Safari is smooth and contained to the tree (no parent-page zoom)
- [ ] Mac trackpad pinch zooms the tree
- [ ] Mouse wheel scrolls the tree; Ctrl+wheel zooms
- [ ] One-finger drag pans
- [ ] Initial load shows the entire tree fit to the viewport
- [ ] `?focus=<userId>` centers and highlights that node
- [ ] Founder ★ badge, current-user green ring, focus amber ring all preserved
- [ ] Real Names toggle works without re-mounting
- [ ] Sponsor link from `LoozerProfile` works (uses `?focus=`)
- [ ] Spectator `/spectator/loozers` Tree view works the same way
- [ ] Card clicks navigate to profile (not the iframe path; direct navigation)
- [ ] iframe + `(embed)` route group + `LoozerTreeFrame` removed
- [ ] Top/bottom navigation never moves during tree zoom
- [ ] Bundle increases by ~50 KB gzipped — acceptable

## Estimated work

- Install + scaffold: 30 min
- Custom node component (reuse existing `NodeCard` JSX): 30 min
- Layout algorithm: 30 min
- Edge wiring + styling: 15 min
- Hook up `?focus=` setCenter: 15 min
- Remove iframe + embed route group + `LoozerTreeFrame`: 15 min
- Spectator page wiring: 15 min
- Cross-device testing (iPhone, Mac trackpad, mouse desktop): 30 min

Total: **~3 hours of focused work** to ship a tree that just works on every device.
