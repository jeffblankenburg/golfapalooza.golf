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
  basePath?: string;
}

function getInitial(name: string): string {
  return (name?.[0] || "?").toUpperCase();
}

function NodeCard({
  loozer,
  basePath,
  isCurrentUser,
}: {
  loozer: Loozer;
  basePath: string;
  isCurrentUser: boolean;
}) {
  return (
    <Link
      href={`${basePath}/${loozer.id}`}
      data-loozer-id={loozer.id}
      className={`inline-flex flex-col items-center gap-1 px-2 py-2 bg-white border rounded-xl shadow-sm w-24 flex-shrink-0 active:bg-gray-50 transition-colors ${
        isCurrentUser ? "border-green-500 ring-2 ring-green-300" : "border-gray-200"
      }`}
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
}: {
  node: Loozer;
  childrenByParent: Map<string, Loozer[]>;
  basePath: string;
  currentUserId: string | null | undefined;
}): React.ReactElement {
  const kids = childrenByParent.get(node.id) || [];

  return (
    <div className="flex items-center">
      <NodeCard loozer={node} basePath={basePath} isCurrentUser={node.id === currentUserId} />
      {kids.length > 0 && (
        <>
          <div className="w-6 h-0.5 bg-gray-400 flex-shrink-0" />
          {kids.length === 1 ? (
            <HorizontalSubtree
              node={kids[0]}
              childrenByParent={childrenByParent}
              basePath={basePath}
              currentUserId={currentUserId}
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

export function LoozerTree({ loozers, currentUserId, basePath = "/loozers" }: LoozerTreeProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { founders, unsponsored, childrenByParent } = useMemo(() => {
    const byId = new Map<string, Loozer>();
    for (const l of loozers) byId.set(l.id, l);

    const childrenByParent = new Map<string, Loozer[]>();
    const founders: Loozer[] = [];
    const unsponsored: Loozer[] = [];

    for (const l of loozers) {
      if (l.is_founder) {
        founders.push(l);
      } else if (l.sponsor_id && byId.has(l.sponsor_id)) {
        if (!childrenByParent.has(l.sponsor_id)) childrenByParent.set(l.sponsor_id, []);
        childrenByParent.get(l.sponsor_id)!.push(l);
      } else {
        unsponsored.push(l);
      }
    }

    const byName = (a: Loozer, b: Loozer) => a.display_name.localeCompare(b.display_name);
    founders.sort(byName);
    unsponsored.sort(byName);
    for (const arr of childrenByParent.values()) arr.sort(byName);

    return { founders, unsponsored, childrenByParent };
  }, [loozers]);

  // Scroll the current user's node into view on mount
  useEffect(() => {
    if (!currentUserId || !scrollRef.current) return;
    const node = scrollRef.current.querySelector<HTMLElement>(
      `[data-loozer-id="${currentUserId}"]`
    );
    if (!node) return;
    node.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
  }, [currentUserId, loozers]);

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
      <div className="flex flex-col gap-10 items-start w-max">
        <div className="flex flex-col gap-8">
          {founders.map((founder) => (
            <HorizontalSubtree
              key={founder.id}
              node={founder}
              childrenByParent={childrenByParent}
              basePath={basePath}
              currentUserId={currentUserId}
            />
          ))}
        </div>
        {unsponsored.length > 0 && (
          <div className="border-t border-dashed border-gray-300 pt-6 w-full">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Unsponsored ({unsponsored.length})
            </p>
            <div className="flex flex-col gap-8">
              {unsponsored.map((l) => (
                <HorizontalSubtree
                  key={l.id}
                  node={l}
                  childrenByParent={childrenByParent}
                  basePath={basePath}
                  currentUserId={currentUserId}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
