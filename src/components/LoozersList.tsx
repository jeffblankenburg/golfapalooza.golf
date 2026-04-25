"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LoozerTree } from "@/components/LoozerTree";

interface Loozer {
  id: string;
  display_name: string;
  avatar_url: string | null;
  has_bio: boolean;
  sponsor_id?: string | null;
  is_founder?: boolean;
  is_financial_only?: boolean;
  is_attending?: boolean;
}

type ViewMode = "grid" | "tree";
type Scope = "all" | "attending";

const VIEW_STORAGE_KEY = "loozers-view-mode";
const SCOPE_STORAGE_KEY = "loozers-scope";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

/**
 * Loozers list with Grid | Tree toggle.
 * - When `loozers` is provided, renders immediately (server-fetched).
 * - When `loozers` is omitted, fetches from `/api/loozers` client-side.
 * - `basePath` controls link prefix (default: "/loozers").
 * - `currentUserId` is used by the tree view to center on the user's node.
 */
export function LoozersList({
  loozers: initialLoozers,
  basePath = "/loozers",
  currentUserId,
}: {
  loozers?: Loozer[];
  basePath?: string;
  currentUserId?: string | null;
}) {
  const searchParams = useSearchParams();
  const focusUserId = searchParams.get("focus");

  const [loozers, setLoozers] = useState<Loozer[]>(initialLoozers || []);
  const [loading, setLoading] = useState(!initialLoozers);
  const [view, setView] = useState<ViewMode>(() => {
    // Focus param forces tree view so the link from a profile lands the right place.
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("focus")) {
      return "tree";
    }
    if (typeof window === "undefined") return "grid";
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      return stored === "tree" || stored === "grid" ? stored : "grid";
    } catch {
      return "grid";
    }
  });

  // If focus arrives after mount (e.g. client-side navigation), force tree view.
  useEffect(() => {
    if (focusUserId) setView("tree");
  }, [focusUserId]);

  const [scope, setScope] = useState<Scope>(() => {
    if (typeof window === "undefined") return "attending";
    try {
      const stored = window.localStorage.getItem(SCOPE_STORAGE_KEY);
      return stored === "all" || stored === "attending" ? stored : "attending";
    } catch {
      return "attending";
    }
  });

  const setViewPersisted = (next: ViewMode) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const setScopePersisted = (next: Scope) => {
    setScope(next);
    try {
      localStorage.setItem(SCOPE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (initialLoozers) return;
    fetch("/api/loozers")
      .then((res) => res.json())
      .then((data) => {
        setLoozers(data.loozers || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [initialLoozers]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loozers.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-lg font-medium">No Loozers found</p>
        <p className="text-sm mt-1">Check back once the roster is set.</p>
      </div>
    );
  }

  // Grid view: exclude financial-only loozers; optionally filter to the active trip's roster.
  const gridLoozers = loozers
    .filter((l) => l.is_financial_only !== true)
    .filter((l) => (scope === "attending" ? l.is_attending === true : true));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {(["grid", "tree"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setViewPersisted(m)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                view === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              }`}
            >
              {m === "grid" ? "Grid" : "Tree"}
            </button>
          ))}
        </div>
        {view === "grid" && (
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            {(["attending", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScopePersisted(s)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  scope === s ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                {s === "attending" ? "Attending" : "All"}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === "grid" ? (
        gridLoozers.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">
            {scope === "attending"
              ? "No Loozers on the active roster yet."
              : "No Loozers to display."}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {gridLoozers.map((loozer) => (
              <Link
                key={loozer.id}
                href={`${basePath}/${loozer.id}`}
                className="flex flex-col items-center p-3 bg-white rounded-xl border border-gray-200 shadow-sm active:scale-95 transition-transform"
              >
                <div className="w-16 h-16 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center mb-2">
                  {loozer.avatar_url ? (
                    <img
                      src={loozer.avatar_url}
                      alt={loozer.display_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xl font-bold">
                      {getInitials(loozer.display_name)}
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold text-gray-900 text-center leading-tight">
                  {loozer.display_name}
                </span>
              </Link>
            ))}
          </div>
        )
      ) : (
        <LoozerTree
          loozers={loozers.map((l) => ({
            id: l.id,
            display_name: l.display_name,
            avatar_url: l.avatar_url,
            sponsor_id: l.sponsor_id ?? null,
            is_founder: l.is_founder === true,
          }))}
          currentUserId={currentUserId}
          focusUserId={focusUserId}
          basePath={basePath}
        />
      )}
    </div>
  );
}
