"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  Handle,
  Position,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface Loozer {
  id: string;
  display_name: string;
  full_name?: string | null;
  avatar_url: string | null;
  sponsor_id: string | null;
  is_founder: boolean;
  events_attended?: number;
}

type Orientation = "horizontal" | "vertical";

interface LoozerTreeProps {
  loozers: Loozer[];
  currentUserId?: string | null;
  focusUserId?: string | null;
  basePath?: string;
  showRealNames?: boolean;
  heightStyle?: string;
  orientation?: Orientation;
  /**
   * When true, fit the whole graph in view on initial load (instead of centering
   * on focusUserId/currentUserId at zoom=1). Useful for subtree views where you
   * want every descendant visible without panning.
   */
  fitOnLoad?: boolean;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 56;
const COLUMN_GAP = 60;
const ROW_GAP = 12;
const COLUMN_STRIDE = NODE_WIDTH + COLUMN_GAP;
// Vertical layout: depth → y, siblings stacked across x. Siblings need a wider
// gap than horizontal-mode rows because each node is 180px wide.
const VERT_ROW_GAP = 60;
const VERT_COL_GAP = 24;

function getInitial(name: string): string {
  return (name?.[0] || "?").toUpperCase();
}

interface LoozerNodeData {
  loozer: Loozer;
  basePath: string;
  isCurrentUser: boolean;
  isFocused: boolean;
  showRealNames: boolean;
  hasParent: boolean;
  hasChildren: boolean;
  orientation: Orientation;
  [key: string]: unknown;
}

function LoozerNode({ data }: NodeProps<Node<LoozerNodeData>>) {
  const { loozer, basePath, isCurrentUser, isFocused, showRealNames, hasParent, hasChildren, orientation } = data;
  const targetPos = orientation === "vertical" ? Position.Top : Position.Left;
  const sourcePos = orientation === "vertical" ? Position.Bottom : Position.Right;
  const ringClass = isFocused
    ? "border-amber-500 ring-2 ring-amber-300"
    : isCurrentUser
      ? "border-green-500 ring-2 ring-green-300"
      : "border-gray-200";
  const label =
    showRealNames && loozer.full_name && loozer.full_name.trim().length > 0
      ? loozer.full_name
      : loozer.display_name;
  const href = `${basePath}/${loozer.id}`;
  // Navigation is driven by ReactFlow's onNodeClick at the <ReactFlow> level —
  // that's the only path that fires reliably across mouse, touch, and pointer
  // capture. We keep <a href> on the inner element purely for accessibility
  // (screen readers, right-click → "Open in new tab") and call preventDefault
  // in case the synthetic click does fire so we don't double-navigate.
  return (
    <>
      {hasParent && (
        <Handle
          type="target"
          position={targetPos}
          style={{ background: "transparent", border: "none", width: 1, height: 1 }}
          isConnectable={false}
        />
      )}
      <a
        href={href}
        data-loozer-id={loozer.id}
        onClick={(e) => e.preventDefault()}
        className={`nopan nodrag flex items-center gap-2 px-2 py-1.5 bg-white border rounded-xl shadow-sm active:bg-gray-50 transition-colors cursor-pointer ${ringClass}`}
        style={{ width: NODE_WIDTH, height: NODE_HEIGHT, touchAction: "manipulation" }}
      >
        <div className="w-9 h-9 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center flex-shrink-0">
          {loozer.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={loozer.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold">{getInitial(loozer.display_name)}</span>
          )}
        </div>
        <span className="flex-1 min-w-0 text-[12px] font-semibold text-gray-900 leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
          {label}
        </span>
        {loozer.events_attended != null && loozer.events_attended > 0 && (
          <span
            title={`${loozer.events_attended} event${loozer.events_attended === 1 ? "" : "s"} attended`}
            aria-label={`${loozer.events_attended} event${loozer.events_attended === 1 ? "" : "s"} attended`}
            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-green-600 rounded-full flex-shrink-0"
          >
            {loozer.events_attended}
          </span>
        )}
        {loozer.is_founder && (
          <span className="text-amber-500 text-sm leading-none flex-shrink-0" aria-label="Founder">★</span>
        )}
      </a>
      {hasChildren && (
        <Handle
          type="source"
          position={sourcePos}
          style={{ background: "transparent", border: "none", width: 1, height: 1 }}
          isConnectable={false}
        />
      )}
    </>
  );
}

const nodeTypes = { loozer: LoozerNode };

interface PartitionResult {
  roots: Loozer[];
  childrenByParent: Map<string, Loozer[]>;
  hasParent: Set<string>;
}

function partition(loozers: Loozer[]): PartitionResult {
  const shown = new Set<string>();
  for (const l of loozers) {
    if (l.is_founder || l.sponsor_id) shown.add(l.id);
  }

  const childrenByParent = new Map<string, Loozer[]>();
  const roots: Loozer[] = [];
  const hasParent = new Set<string>();

  for (const l of loozers) {
    if (!shown.has(l.id)) continue;
    if (l.is_founder) {
      roots.push(l);
    } else if (l.sponsor_id && shown.has(l.sponsor_id)) {
      if (!childrenByParent.has(l.sponsor_id)) childrenByParent.set(l.sponsor_id, []);
      childrenByParent.get(l.sponsor_id)!.push(l);
      hasParent.add(l.id);
    } else {
      // Sponsored, but the sponsor isn't shown — treat as orphan root.
      roots.push(l);
    }
  }

  const byName = (a: Loozer, b: Loozer) => a.display_name.localeCompare(b.display_name);
  roots.sort((a, b) => {
    if (a.is_founder !== b.is_founder) return a.is_founder ? -1 : 1;
    return byName(a, b);
  });
  for (const arr of childrenByParent.values()) arr.sort(byName);

  return { roots, childrenByParent, hasParent };
}

/**
 * Recursive horizontal-tree layout. Each subtree is laid out by recursively
 * positioning its children stacked vertically. The parent's y is the
 * midpoint of its first and last child so connector lines look balanced.
 *
 * Returns the [topY, bottomY] vertical range occupied by this subtree.
 */
function layoutSubtree(
  node: Loozer,
  depth: number,
  topY: number,
  childrenByParent: Map<string, Loozer[]>,
  positions: Map<string, { x: number; y: number }>
): { topY: number; bottomY: number } {
  const x = depth * COLUMN_STRIDE;
  const kids = childrenByParent.get(node.id) || [];

  if (kids.length === 0) {
    positions.set(node.id, { x, y: topY });
    return { topY, bottomY: topY + NODE_HEIGHT };
  }

  let cursorY = topY;
  const kidRanges: { topY: number; bottomY: number }[] = [];
  for (const kid of kids) {
    const range = layoutSubtree(kid, depth + 1, cursorY, childrenByParent, positions);
    kidRanges.push(range);
    cursorY = range.bottomY + ROW_GAP;
  }
  // Center this node vertically against its children's combined range.
  const firstKidCenter = (kidRanges[0].topY + kidRanges[0].bottomY) / 2;
  const lastKidCenter =
    (kidRanges[kidRanges.length - 1].topY + kidRanges[kidRanges.length - 1].bottomY) / 2;
  const myY = (firstKidCenter + lastKidCenter) / 2 - NODE_HEIGHT / 2;
  positions.set(node.id, { x, y: myY });
  return {
    topY: Math.min(myY, kidRanges[0].topY),
    bottomY: Math.max(myY + NODE_HEIGHT, kidRanges[kidRanges.length - 1].bottomY),
  };
}

/**
 * Vertical-tree layout. Depth maps to y; siblings stack horizontally.
 * Returns the [leftX, rightX] horizontal range occupied by this subtree.
 */
function layoutSubtreeVertical(
  node: Loozer,
  depth: number,
  leftX: number,
  childrenByParent: Map<string, Loozer[]>,
  positions: Map<string, { x: number; y: number }>
): { leftX: number; rightX: number } {
  const y = depth * (NODE_HEIGHT + VERT_ROW_GAP);
  const kids = childrenByParent.get(node.id) || [];

  if (kids.length === 0) {
    positions.set(node.id, { x: leftX, y });
    return { leftX, rightX: leftX + NODE_WIDTH };
  }

  let cursorX = leftX;
  const kidRanges: { leftX: number; rightX: number }[] = [];
  for (const kid of kids) {
    const range = layoutSubtreeVertical(kid, depth + 1, cursorX, childrenByParent, positions);
    kidRanges.push(range);
    cursorX = range.rightX + VERT_COL_GAP;
  }
  // Center this node horizontally against its children's combined range.
  const firstKidCenter = (kidRanges[0].leftX + kidRanges[0].rightX) / 2;
  const lastKidCenter =
    (kidRanges[kidRanges.length - 1].leftX + kidRanges[kidRanges.length - 1].rightX) / 2;
  const myX = (firstKidCenter + lastKidCenter) / 2 - NODE_WIDTH / 2;
  positions.set(node.id, { x: myX, y });
  return {
    leftX: Math.min(myX, kidRanges[0].leftX),
    rightX: Math.max(myX + NODE_WIDTH, kidRanges[kidRanges.length - 1].rightX),
  };
}

function buildGraph(
  loozers: Loozer[],
  currentUserId: string | null | undefined,
  focusUserId: string | null | undefined,
  basePath: string,
  showRealNames: boolean,
  orientation: Orientation
): { nodes: Node<LoozerNodeData>[]; edges: Edge[] } {
  const { roots, childrenByParent, hasParent } = partition(loozers);

  const positions = new Map<string, { x: number; y: number }>();
  if (orientation === "vertical") {
    let cursorX = 0;
    for (const root of roots) {
      const range = layoutSubtreeVertical(root, 0, cursorX, childrenByParent, positions);
      cursorX = range.rightX + VERT_COL_GAP * 2;
    }
  } else {
    let cursorY = 0;
    for (const root of roots) {
      const range = layoutSubtree(root, 0, cursorY, childrenByParent, positions);
      cursorY = range.bottomY + ROW_GAP * 2; // a little extra breathing room between separate trees
    }
  }

  const byId = new Map<string, Loozer>();
  for (const l of loozers) byId.set(l.id, l);

  const nodes: Node<LoozerNodeData>[] = [];
  for (const [id, pos] of positions.entries()) {
    const loozer = byId.get(id);
    if (!loozer) continue;
    nodes.push({
      id,
      type: "loozer",
      position: pos,
      data: {
        loozer,
        basePath,
        isCurrentUser: currentUserId === id,
        isFocused: focusUserId != null && focusUserId === id,
        showRealNames,
        hasParent: hasParent.has(id),
        hasChildren: (childrenByParent.get(id)?.length || 0) > 0,
        orientation,
      },
      // Disable drag — this is a read-only tree.
      draggable: false,
      selectable: false,
    });
  }

  const edges: Edge[] = [];
  for (const [parentId, kids] of childrenByParent.entries()) {
    if (!positions.has(parentId)) continue;
    for (const kid of kids) {
      if (!positions.has(kid.id)) continue;
      edges.push({
        id: `${parentId}-${kid.id}`,
        source: parentId,
        target: kid.id,
        type: "smoothstep",
        style: { stroke: "#9ca3af", strokeWidth: 2 },
      });
    }
  }

  return { nodes, edges };
}

function LoozerTreeInner({
  loozers,
  currentUserId,
  focusUserId,
  basePath = "/loozers",
  showRealNames = false,
  orientation = "horizontal",
  fitOnLoad = false,
}: LoozerTreeProps) {
  const { setCenter } = useReactFlow();
  const router = useRouter();
  const mountedRef = useRef(false);

  const { nodes, edges } = useMemo(
    () => buildGraph(loozers, currentUserId, focusUserId, basePath, showRealNames, orientation),
    [loozers, currentUserId, focusUserId, basePath, showRealNames, orientation]
  );

  // ReactFlow's onNodeClick is the only event that fires reliably on both
  // mouse and touch — the pane's pointerdown preventDefault can suppress
  // synthetic click events on the inner anchor, and setPointerCapture during
  // drag can redirect pointerup away from it. Driving navigation from here
  // sidesteps all of that.
  const handleNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node<LoozerNodeData>) => {
      router.push(`${node.data.basePath}/${node.data.loozer.id}`);
    },
    [router]
  );

  // onInit fires once, after the React Flow viewport is fully initialized and
  // the container has been measured. This is the safe place to call fitBounds /
  // fitView without racing against the library's own layout pass. The deps
  // could in principle make this recreate, but ReactFlow only invokes onInit
  // once at init time, so a later identity change has no effect.
  const handleInit = useCallback(
    (rf: ReactFlowInstance<Node<LoozerNodeData>, Edge>) => {
      if (fitOnLoad) {
        rf.fitView({ padding: 0.15, duration: 0 });
        mountedRef.current = true;
        return;
      }

      if (focusUserId) {
        const node = rf.getNode(focusUserId);
        if (node) {
          rf.setCenter(
            node.position.x + NODE_WIDTH / 2,
            node.position.y + NODE_HEIGHT / 2,
            { zoom: 1, duration: 0 }
          );
          mountedRef.current = true;
          return;
        }
      }

      if (currentUserId) {
        const userNode = rf.getNode(currentUserId);
        const userLoozer = loozers.find((l) => l.id === currentUserId);
        if (userNode && userLoozer) {
          const familyIds = new Set<string>([currentUserId]);
          if (userLoozer.sponsor_id) familyIds.add(userLoozer.sponsor_id);
          for (const l of loozers) {
            if (l.sponsor_id === currentUserId) familyIds.add(l.id);
          }
          const familyNodes = rf.getNodes().filter((n) => familyIds.has(n.id));
          // Build a bounding box symmetric around the user so the user stays
          // visually centered regardless of how the sponsor / sponsees fall.
          const userCx = userNode.position.x + NODE_WIDTH / 2;
          const userCy = userNode.position.y + NODE_HEIGHT / 2;
          let halfW = NODE_WIDTH / 2;
          let halfH = NODE_HEIGHT / 2;
          for (const n of familyNodes) {
            halfW = Math.max(
              halfW,
              Math.abs(n.position.x - userCx),
              Math.abs(n.position.x + NODE_WIDTH - userCx)
            );
            halfH = Math.max(
              halfH,
              Math.abs(n.position.y - userCy),
              Math.abs(n.position.y + NODE_HEIGHT - userCy)
            );
          }
          rf.fitBounds(
            { x: userCx - halfW, y: userCy - halfH, width: halfW * 2, height: halfH * 2 },
            { padding: 0.15, duration: 0 }
          );
          mountedRef.current = true;
          return;
        }
      }

      rf.fitView({ padding: 0.1, duration: 0 });
      mountedRef.current = true;
    },
    [loozers, currentUserId, focusUserId, fitOnLoad]
  );

  // After mount, if focusUserId changes (e.g. ?focus= via client-side
  // navigation), smoothly pan to the new target.
  useEffect(() => {
    if (!mountedRef.current) return;
    if (!focusUserId) return;
    const node = nodes.find((n) => n.id === focusUserId);
    if (!node) return;
    setCenter(
      node.position.x + NODE_WIDTH / 2,
      node.position.y + NODE_HEIGHT / 2,
      { zoom: 1, duration: 400 }
    );
  }, [focusUserId, nodes, setCenter]);

  if (loozers.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-gray-400">No Loozers to display.</div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      minZoom={0.2}
      maxZoom={1.5}
      panOnDrag
      panOnScroll
      zoomOnPinch
      zoomOnScroll={false}
      preventScrolling={false}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      onNodeClick={handleNodeClick}
      onInit={handleInit}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} size={1} color="#e5e7eb" />
      <Controls position="top-right" showInteractive={false} />
    </ReactFlow>
  );
}

export function LoozerTree(props: LoozerTreeProps) {
  const { heightStyle = "calc(100dvh - 280px)" } = props;
  return (
    <div
      className="w-full bg-gray-50 border border-gray-200 rounded-xl overflow-hidden"
      style={{ height: heightStyle }}
    >
      <ReactFlowProvider>
        <LoozerTreeInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
