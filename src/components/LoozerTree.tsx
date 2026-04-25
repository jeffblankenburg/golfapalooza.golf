"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";

interface Loozer {
  id: string;
  display_name: string;
  avatar_url: string | null;
  sponsor_id: string | null;
  is_founder: boolean;
}

interface LoozerTreeProps {
  loozers: Loozer[];
  currentUserId?: string | null;
  focusUserId?: string | null;
  basePath?: string;
}

function getInitial(name: string): string {
  return (name?.[0] || "?").toUpperCase();
}

function NodeCard({
  loozer,
  basePath,
  isCurrentUser,
  isFocused,
}: {
  loozer: Loozer;
  basePath: string;
  isCurrentUser: boolean;
  isFocused?: boolean;
}) {
  const ringClass = isFocused
    ? "border-amber-500 ring-2 ring-amber-300"
    : isCurrentUser
      ? "border-green-500 ring-2 ring-green-300"
      : "border-gray-200";
  return (
    <Link
      href={`${basePath}/${loozer.id}`}
      data-loozer-id={loozer.id}
      className={`inline-flex flex-col items-center gap-1 px-2 py-2 bg-white border rounded-xl shadow-sm w-24 flex-shrink-0 active:bg-gray-50 transition-colors ${ringClass}`}
    >
      <div className="w-12 h-12 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center">
        {loozer.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={loozer.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-base font-bold">{getInitial(loozer.display_name)}</span>
        )}
      </div>
      <span className="text-[11px] font-semibold text-gray-900 text-center leading-tight line-clamp-2">
        {loozer.display_name}
      </span>
      {loozer.is_founder && (
        <span className="text-[9px] text-amber-700 font-semibold">★ Founder</span>
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
}: {
  node: Loozer;
  childrenByParent: Map<string, Loozer[]>;
  basePath: string;
  currentUserId: string | null | undefined;
  focusUserId: string | null | undefined;
}): React.ReactElement {
  const kids = childrenByParent.get(node.id) || [];

  return (
    <div className="flex items-center">
      <NodeCard
        loozer={node}
        basePath={basePath}
        isCurrentUser={node.id === currentUserId}
        isFocused={focusUserId != null && node.id === focusUserId}
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
                  <div key={kid.id} className="relative pl-6 py-2 flex items-center">
                    <div style={spineStyle} />
                    <div className="absolute left-0 top-1/2 w-6 h-0.5 -translate-y-1/2 bg-gray-400" />
                    <HorizontalSubtree
                      node={kid}
                      childrenByParent={childrenByParent}
                      basePath={basePath}
                      currentUserId={currentUserId}
                      focusUserId={focusUserId}
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

export function LoozerTree({ loozers, currentUserId, focusUserId, basePath = "/loozers" }: LoozerTreeProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

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

  if (loozers.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-gray-400">No Loozers to display.</div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="w-full max-h-[80vh] overflow-auto bg-gray-50 border border-gray-200 rounded-xl p-6"
    >
      <div className="flex flex-col gap-8 items-start w-max">
        {roots.map((root) => (
          <HorizontalSubtree
            key={root.id}
            node={root}
            childrenByParent={childrenByParent}
            basePath={basePath}
            currentUserId={currentUserId}
            focusUserId={focusUserId}
          />
        ))}
      </div>
    </div>
  );
}
