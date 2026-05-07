"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { LoozerTree } from "@/components/LoozerTree";
import { LoozerMap } from "@/components/LoozerMap";
import { readGeoCache, writeGeoCache, GEO_CACHE_TTL_MS } from "@/lib/geo-cache";

interface Loozer {
  id: string;
  display_name: string;
  full_name?: string | null;
  avatar_url: string | null;
  has_bio: boolean;
  sponsor_id?: string | null;
  is_founder?: boolean;
  is_financial_only?: boolean;
  is_attending?: boolean;
  events_attended?: number;
}

type ViewMode = "grid" | "tree" | "map";
type Scope = "attending" | "not-attending" | "all";

const SCOPE_CYCLE: Scope[] = ["attending", "not-attending", "all"];
const SCOPE_LABEL: Record<Scope, string> = {
  attending: "Attending",
  "not-attending": "Not Attending",
  all: "All",
};

const VIEW_STORAGE_KEY = "loozers-view-mode";
const SCOPE_STORAGE_KEY = "loozers-scope";
const REAL_NAMES_STORAGE_KEY = "loozers-show-real-names";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

function TabChip({
  onClick,
  children,
  pressed,
}: {
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 bg-white text-gray-900 shadow-sm active:bg-gray-100 transition-colors"
    >
      {children}
    </button>
  );
}

/**
 * Loozers list with Grid | Tree | Map tabs.
 * - When `loozers` is provided, renders immediately (server-fetched).
 * - When `loozers` is omitted, fetches from `/api/loozers` client-side.
 * - `basePath` controls link prefix (default: "/loozers").
 * - `currentUserId` is used by the tree view to center on the user's node.
 */
export function LoozersList({
  loozers: initialLoozers,
  basePath = "/loozers",
  currentUserId,
  spectator = false,
}: {
  loozers?: Loozer[];
  basePath?: string;
  currentUserId?: string | null;
  spectator?: boolean;
}) {
  // SSR-safe defaults (Grid + Attending). On mount we restore the user's last
  // choice from localStorage, or honor the ?focus= param which forces tree view.
  const [focusUserId, setFocusUserId] = useState<string | null>(null);
  const [loozers, setLoozers] = useState<Loozer[]>(initialLoozers || []);
  const [loading, setLoading] = useState(!initialLoozers);
  const [view, setView] = useState<ViewMode>("grid");

  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get("focus");
    setFocusUserId(focus);
    if (focus) {
      setView("tree");
      return;
    }
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "tree" || stored === "grid" || stored === "map") setView(stored);
    } catch {
      // ignore
    }
  }, []);

  const [scope, setScope] = useState<Scope>("attending");
  const [showRealNames, setShowRealNames] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SCOPE_STORAGE_KEY);
      if (stored === "all" || stored === "attending" || stored === "not-attending") setScope(stored);
    } catch {
      // ignore
    }
    try {
      const storedNames = window.localStorage.getItem(REAL_NAMES_STORAGE_KEY);
      if (storedNames === "true") setShowRealNames(true);
    } catch {
      // ignore
    }
  }, []);

  const setViewPersisted = (next: ViewMode) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const cycleScope = () => {
    const idx = SCOPE_CYCLE.indexOf(scope);
    const next = SCOPE_CYCLE[(idx + 1) % SCOPE_CYCLE.length];
    setScope(next);
    try {
      localStorage.setItem(SCOPE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const toggleRealNames = () => {
    const next = !showRealNames;
    setShowRealNames(next);
    try {
      localStorage.setItem(REAL_NAMES_STORAGE_KEY, next ? "true" : "false");
    } catch {
      // ignore
    }
  };

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [flyToUserNonce, setFlyToUserNonce] = useState(0);

  useEffect(() => {
    const cached = readGeoCache();
    if (cached) setUserLocation({ lat: cached.lat, lng: cached.lng });
  }, []);

  const locateMe = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocateError("Geolocation isn't available on this device.");
      return;
    }
    setLocateError(null);
    if (userLocation) {
      setFlyToUserNonce((n) => n + 1);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        writeGeoCache(latitude, longitude);
        setUserLocation({ lat: latitude, lng: longitude });
        setFlyToUserNonce((n) => n + 1);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocateError(err.code === err.PERMISSION_DENIED ? "Location permission denied." : "Couldn't get your location.");
      },
      { enableHighAccuracy: false, maximumAge: GEO_CACHE_TTL_MS, timeout: 8000 }
    );
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

  const gridLoozers = loozers
    .filter((l) => l.is_financial_only !== true)
    .filter((l) => {
      if (scope === "attending") return l.is_attending === true;
      if (scope === "not-attending") return l.is_attending !== true;
      return true;
    });

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {(["grid", "tree", "map"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setViewPersisted(m)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                view === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              }`}
            >
              {m === "grid" ? "Grid" : m === "tree" ? "Tree" : "Map"}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          {view === "grid" && (
            <TabChip onClick={cycleScope}>{SCOPE_LABEL[scope]}</TabChip>
          )}
          {view === "tree" && !spectator && (
            <TabChip onClick={toggleRealNames} pressed={showRealNames}>
              Real Names: {showRealNames ? "On" : "Off"}
            </TabChip>
          )}
          {view === "map" && (
            <TabChip onClick={locateMe}>
              {locating ? "Locating…" : "📍 Find me"}
            </TabChip>
          )}
        </div>
      </div>
      {view === "map" && locateError && (
        <p className="text-xs text-red-600 mb-2">{locateError}</p>
      )}

      {view === "grid" ? (
        gridLoozers.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">
            {scope === "attending"
              ? "No Loozers on the active roster yet."
              : scope === "not-attending"
                ? "Every Loozer is on the active roster."
                : "No Loozers to display."}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {gridLoozers.map((loozer) => (
              <Link
                key={loozer.id}
                href={`${basePath}/${loozer.id}`}
                className="relative flex flex-col items-center p-3 bg-white rounded-xl border border-gray-200 shadow-sm active:scale-95 transition-transform"
              >
                <div className="relative mb-2">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center">
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
                  {loozer.events_attended != null && loozer.events_attended > 0 && (
                    <span
                      title={`${loozer.events_attended} event${loozer.events_attended === 1 ? "" : "s"} attended`}
                      aria-label={`${loozer.events_attended} event${loozer.events_attended === 1 ? "" : "s"} attended`}
                      className="absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold text-white bg-green-600 rounded-full border-2 border-white"
                    >
                      {loozer.events_attended}
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
      ) : view === "tree" ? (
        <LoozerTree
          loozers={loozers.map((l) => ({
            id: l.id,
            display_name: l.display_name,
            full_name: l.full_name ?? null,
            avatar_url: l.avatar_url,
            sponsor_id: l.sponsor_id ?? null,
            is_founder: l.is_founder === true,
            events_attended: l.events_attended ?? 0,
          }))}
          currentUserId={currentUserId}
          focusUserId={focusUserId}
          basePath={basePath}
          showRealNames={!spectator && showRealNames}
        />
      ) : (
        <LoozerMap
          basePath={basePath}
          userLocation={userLocation}
          flyToUserNonce={flyToUserNonce}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}
