"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.15;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

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

function getInitial(name: string): string {
  return (name?.[0] || "?").toUpperCase();
}

function NodeCard({
  loozer,
  basePath,
  isCurrentUser,
  isFocused,
  showRealNames,
}: {
  loozer: Loozer;
  basePath: string;
  isCurrentUser: boolean;
  isFocused?: boolean;
  showRealNames?: boolean;
}) {
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
    <Link
      href={`${basePath}/${loozer.id}`}
      data-loozer-id={loozer.id}
      className={`inline-flex items-center gap-2 px-2 py-1.5 bg-white border rounded-xl shadow-sm flex-shrink-0 active:bg-gray-50 transition-colors ${ringClass}`}
      style={{ minWidth: 140 }}
    >
      <div className="w-9 h-9 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center flex-shrink-0">
        {loozer.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={loozer.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm font-bold">{getInitial(loozer.display_name)}</span>
        )}
      </div>
      <span className="text-[12px] font-semibold text-gray-900 leading-tight whitespace-nowrap pr-1">
        {label}
      </span>
      {loozer.is_founder && (
        <span className="text-amber-500 text-sm leading-none flex-shrink-0" aria-label="Founder">★</span>
      )}
    </Link>
  );
}

function HorizontalSubtree({
  node,
  childrenByParent,
  basePath,
  currentUserId,
  focusUserId,
  showRealNames,
}: {
  node: Loozer;
  childrenByParent: Map<string, Loozer[]>;
  basePath: string;
  currentUserId: string | null | undefined;
  focusUserId: string | null | undefined;
  showRealNames: boolean;
}): React.ReactElement {
  const kids = childrenByParent.get(node.id) || [];

  return (
    <div className="flex items-center">
      <NodeCard
        loozer={node}
        basePath={basePath}
        isCurrentUser={node.id === currentUserId}
        isFocused={focusUserId != null && node.id === focusUserId}
        showRealNames={showRealNames}
      />
      {kids.length > 0 && (
        <>
          <div className="w-6 h-0.5 bg-gray-400 flex-shrink-0" />
          {kids.length === 1 ? (
            <HorizontalSubtree
              node={kids[0]}
              childrenByParent={childrenByParent}
              basePath={basePath}
              currentUserId={currentUserId}
              focusUserId={focusUserId}
              showRealNames={showRealNames}
            />
          ) : (
            <div className="flex flex-col">
              {kids.map((kid, i) => {
                const isFirst = i === 0;
                const isLast = i === kids.length - 1;
                const spineStyle: React.CSSProperties = {
                  position: "absolute",
                  left: 0,
                  width: 2,
                  background: "#9ca3af",
                  top: isFirst ? "50%" : 0,
                  bottom: isLast ? "50%" : 0,
                };
                return (
                  <div key={kid.id} className="relative pl-6 py-1 flex items-center">
                    <div style={spineStyle} />
                    <div className="absolute left-0 top-1/2 w-6 h-0.5 -translate-y-1/2 bg-gray-400" />
                    <HorizontalSubtree
                      node={kid}
                      childrenByParent={childrenByParent}
                      basePath={basePath}
                      currentUserId={currentUserId}
                      focusUserId={focusUserId}
                      showRealNames={showRealNames}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function LoozerTree({ loozers, currentUserId, focusUserId, basePath = "/loozers", showRealNames = false }: LoozerTreeProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);

  const fitToView = () => {
    const container = scrollRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const rect = content.getBoundingClientRect();
    // Natural size = current visible size / current zoom (zoom scales the box).
    const naturalWidth = rect.width / zoom;
    const naturalHeight = rect.height / zoom;
    // p-6 = 24px padding on each side.
    const availableWidth = container.clientWidth - 48;
    const availableHeight = container.clientHeight - 48;
    if (naturalWidth <= 0 || naturalHeight <= 0) return;
    const next = Math.min(
      availableWidth / naturalWidth,
      availableHeight / naturalHeight,
      1
    );
    setZoom(clampZoom(next));
  };

  const { roots, childrenByParent } = useMemo(() => {
    // A loozer is "shown" if they're a founder OR have a sponsor.
    // Non-founders without a sponsor are hidden entirely.
    const shown = new Set<string>();
    for (const l of loozers) {
      if (l.is_founder || l.sponsor_id) shown.add(l.id);
    }

    const childrenByParent = new Map<string, Loozer[]>();
    const roots: Loozer[] = [];

    for (const l of loozers) {
      if (!shown.has(l.id)) continue;
      if (l.is_founder) {
        roots.push(l);
      } else if (l.sponsor_id && shown.has(l.sponsor_id)) {
        if (!childrenByParent.has(l.sponsor_id)) childrenByParent.set(l.sponsor_id, []);
        childrenByParent.get(l.sponsor_id)!.push(l);
      } else {
        // Sponsored, but the sponsor is hidden — surface as a root so the lineage isn't lost.
        roots.push(l);
      }
    }

    const byName = (a: Loozer, b: Loozer) => a.display_name.localeCompare(b.display_name);
    // Founders first, then orphans, alphabetical within each group.
    roots.sort((a, b) => {
      if (a.is_founder !== b.is_founder) return a.is_founder ? -1 : 1;
      return byName(a, b);
    });
    for (const arr of childrenByParent.values()) arr.sort(byName);

    return { roots, childrenByParent };
  }, [loozers]);

  // Scroll the focus user (or current user) into view on mount.
  useEffect(() => {
    if (!scrollRef.current) return;
    const targetId = focusUserId || currentUserId;
    if (!targetId) return;
    const node = scrollRef.current.querySelector<HTMLElement>(
      `[data-loozer-id="${targetId}"]`
    );
    if (!node) return;
    node.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
  }, [focusUserId, currentUserId, loozers]);

  // Trackpad pinch shows up as a Ctrl+wheel event. Only intercept when Ctrl is held
  // so plain scrolling stays native and untouched.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => clampZoom(z - e.deltaY * 0.005));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  if (loozers.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-gray-400">No Loozers to display.</div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="w-full max-h-[80vh] overflow-auto bg-gray-50 border border-gray-200 rounded-xl p-6"
      >
        <div
          ref={contentRef}
          className="flex flex-col gap-4 items-start w-max transition-[zoom] duration-150"
          style={{ zoom }}
        >
          {roots.map((root) => (
            <HorizontalSubtree
              key={root.id}
              node={root}
              childrenByParent={childrenByParent}
              basePath={basePath}
              currentUserId={currentUserId}
              focusUserId={focusUserId}
              showRealNames={showRealNames}
            />
          ))}
        </div>
      </div>
      <div className="absolute bottom-2 right-2 flex flex-col gap-1 bg-white/90 backdrop-blur border border-gray-200 rounded-lg shadow-sm">
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
          disabled={zoom >= MAX_ZOOM}
          aria-label="Zoom in"
          className="w-8 h-8 flex items-center justify-center text-gray-700 active:bg-gray-100 disabled:opacity-30 rounded-t-lg"
        >
          <span className="text-base leading-none">+</span>
        </button>
        <button
          type="button"
          onClick={fitToView}
          aria-label="Fit tree to view"
          className="w-8 h-8 flex items-center justify-center text-[9px] font-semibold text-gray-600 active:bg-gray-100 border-y border-gray-200"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
          disabled={zoom <= MIN_ZOOM}
          aria-label="Zoom out"
          className="w-8 h-8 flex items-center justify-center text-gray-700 active:bg-gray-100 disabled:opacity-30 rounded-b-lg"
        >
          <span className="text-base leading-none">−</span>
        </button>
      </div>
    </div>
  );
}
