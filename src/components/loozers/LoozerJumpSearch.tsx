"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";

export interface JumpSearchItem {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

/**
 * Jump-to-Loozer search box for the top of a profile page.
 * - On focus, shows the full A–Z roster; typing filters by display_name + full_name.
 * - Keyboard: ↑/↓ to move, Enter to navigate, Escape to close.
 * - Selecting a Loozer navigates to their profile.
 * The `currentUserId` is excluded so the box only offers other Loozers.
 */
export function LoozerJumpSearch({
  loozers,
  currentUserId,
}: {
  loozers: JumpSearchItem[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return loozers.filter((l) => {
      if (l.id === currentUserId) return false;
      if (!q) return true;
      return (
        l.display_name.toLowerCase().includes(q) ||
        (l.full_name?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [loozers, currentUserId, search]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the active row scrolled into view.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function go(item: JumpSearchItem) {
    setOpen(false);
    setSearch("");
    router.push(`/loozers/${item.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const item = filtered[activeIndex];
      if (item) {
        e.preventDefault();
        go(item);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Jump to a Loozer…"
          aria-label="Search Loozers"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
        />
      </div>

      {open && (
        <ul
          ref={listRef}
          className="absolute z-40 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">No Loozers found</li>
          ) : (
            filtered.map((l, i) => (
              <li key={l.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => go(l)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                    i === activeIndex ? "bg-green-50" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="w-8 h-8 shrink-0 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center">
                    {l.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.avatar_url} alt={l.display_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold">{getInitials(l.display_name)}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{l.display_name}</div>
                    {l.full_name && l.full_name !== l.display_name && (
                      <div className="text-xs text-gray-500 truncate">{l.full_name}</div>
                    )}
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
