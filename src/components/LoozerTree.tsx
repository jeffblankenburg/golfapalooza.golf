"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface Loozer {
  id: string;
  display_name: string;
  full_name?: string | null;
  avatar_url: string | null;
  sponsor_id: string | null;
  is_founder: boolean;
}

interface LoozerTreeProps {
  loozers: Loozer[];
  currentUserId?: string | null;
  focusUserId?: string | null;
  basePath?: string;
  showRealNames?: boolean;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 56;
const COLUMN_GAP = 60;
const ROW_GAP = 12;
const COLUMN_STRIDE = NODE_WIDTH + COLUMN_GAP;
const ROW_STRIDE = NODE_HEIGHT + ROW_GAP;

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
  [key: string]: unknown;
}

function LoozerNode({ data }: NodeProps<Node<LoozerNodeData>>) {
  const { loozer, basePath, isCurrentUser, isFocused, showRealNames, hasParent, hasChildren } = data;
  const ringClass = isFocused
    ? "border-amber-500 ring-2 ring-amber-300"
    : isCurrentUser
      ? "border-green-500 ring-2 ring-green-300"
      : "border-gray-200";
  const label =
    showRealNames && loozer.full_name && loozer.full_name.trim().length > 0
      ? loozer.full_name
      : loozer.display_name;
  return (
    <>
      {hasParent && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: "transparent", border: "none", width: 1, height: 1 }}
          isConnectable={false}
        />
      )}
      <Link
        href={`${basePath}/${loozer.id}`}
        data-loozer-id={loozer.id}
        className={`flex items-center gap-2 px-2 py-1.5 bg-white border rounded-xl shadow-sm active:bg-gray-50 transition-colors ${ringClass}`}
        style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
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
        {loozer.is_founder && (
          <span className="text-amber-500 text-sm leading-none flex-shrink-0" aria-label="Founder">★</span>
        )}
      </Link>
      {hasChildren && (
        <Handle
          type="source"
          position={Position.Right}
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

function buildGraph(
  loozers: Loozer[],
  currentUserId: string | null | undefined,
  focusUserId: string | null | undefined,
  basePath: string,
  showRealNames: boolean
): { nodes: Node<LoozerNodeData>[]; edges: Edge[] } {
  const { roots, childrenByParent, hasParent } = partition(loozers);

  const positions = new Map<string, { x: number; y: number }>();
  let cursorY = 0;
  for (const root of roots) {
    const range = layoutSubtree(root, 0, cursorY, childrenByParent, positions);
    cursorY = range.bottomY + ROW_GAP * 2; // a little extra breathing room between separate trees
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
}: LoozerTreeProps) {
  const { setCenter, fitView } = useReactFlow();
  const hasInitialized = useRef(false);

  const { nodes, edges } = useMemo(
    () => buildGraph(loozers, currentUserId, focusUserId, basePath, showRealNames),
    [loozers, currentUserId, focusUserId, basePath, showRealNames]
  );

  // Initial viewport: pan to the focus user (if ?focus= was passed), otherwise
  // pan to the current user, otherwise fit the whole tree. Runs once.
  useEffect(() => {
    if (hasInitialized.current) return;
    if (nodes.length === 0) return;

    const targetId = focusUserId || currentUserId;
    if (targetId) {
      const node = nodes.find((n) => n.id === targetId);
      if (node) {
        const id = requestAnimationFrame(() => {
          setCenter(
            node.position.x + NODE_WIDTH / 2,
            node.position.y + NODE_HEIGHT / 2,
            { zoom: 1, duration: 0 }
          );
        });
        hasInitialized.current = true;
        return () => cancelAnimationFrame(id);
      }
    }

    // No target — fit the whole tree.
    const id = requestAnimationFrame(() => {
      fitView({ padding: 0.1, duration: 0 });
    });
    hasInitialized.current = true;
    return () => cancelAnimationFrame(id);
  }, [nodes, focusUserId, currentUserId, setCenter, fitView]);

  // After mount, if ?focus=<id> changes (e.g. via client-side navigation),
  // smoothly pan to the new target.
  useEffect(() => {
    if (!hasInitialized.current) return;
    if (!focusUserId) return;
    const node = nodes.find((n) => n.id === focusUserId);
    if (!node) return;
    const id = requestAnimationFrame(() => {
      setCenter(
        node.position.x + NODE_WIDTH / 2,
        node.position.y + NODE_HEIGHT / 2,
        { zoom: 1, duration: 400 }
      );
    });
    return () => cancelAnimationFrame(id);
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
      fitView
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
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} size={1} color="#e5e7eb" />
      <Controls position="top-right" showInteractive={false} />
    </ReactFlow>
  );
}

export function LoozerTree(props: LoozerTreeProps) {
  return (
    <div
      className="w-full bg-gray-50 border border-gray-200 rounded-xl overflow-hidden"
      style={{ height: "calc(100dvh - 280px)" }}
    >
      <ReactFlowProvider>
        <LoozerTreeInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
