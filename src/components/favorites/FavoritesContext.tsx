"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface FavoritePrefs {
  notify_round_started: boolean;
  notify_hole_completed: boolean;
  notify_round_completed: boolean;
}

export const DEFAULT_PREFS: FavoritePrefs = {
  notify_round_started: true,
  notify_hole_completed: true,
  notify_round_completed: true,
};

interface FavoritesContextValue {
  ready: boolean;
  isFavorite: (userId: string) => boolean;
  getPrefs: (userId: string) => FavoritePrefs | null;
  addFavorite: (userId: string, prefs?: FavoritePrefs) => Promise<boolean>;
  updatePrefs: (
    userId: string,
    patch: Partial<FavoritePrefs>
  ) => Promise<boolean>;
  removeFavorite: (userId: string) => Promise<boolean>;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

interface ApiFavorite {
  favorite_user_id: string;
  notify_round_started: boolean;
  notify_hole_completed: boolean;
  notify_round_completed: boolean;
}

/**
 * Loads the current user's favorites once (issue #140) and shares the map
 * across every FavoriteStarButton so favoriting on one surface (a /loozers
 * card) instantly reflects on another (the profile star), with no per-card
 * fetch. Mutations are optimistic and revert on API failure.
 */
export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [map, setMap] = useState<Map<string, FavoritePrefs>>(new Map());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/favorites")
      .then((res) => (res.ok ? res.json() : { favorites: [] }))
      .then((data) => {
        if (cancelled) return;
        const next = new Map<string, FavoritePrefs>();
        for (const f of (data.favorites || []) as ApiFavorite[]) {
          next.set(f.favorite_user_id, {
            notify_round_started: f.notify_round_started,
            notify_hole_completed: f.notify_hole_completed,
            notify_round_completed: f.notify_round_completed,
          });
        }
        setMap(next);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isFavorite = useCallback((userId: string) => map.has(userId), [map]);
  const getPrefs = useCallback(
    (userId: string) => map.get(userId) ?? null,
    [map]
  );

  const addFavorite = useCallback(
    async (userId: string, prefs: FavoritePrefs = DEFAULT_PREFS) => {
      setMap((prev) => new Map(prev).set(userId, prefs));
      try {
        const res = await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ favorite_user_id: userId, preferences: prefs }),
        });
        if (!res.ok) throw new Error("failed");
        return true;
      } catch {
        setMap((prev) => {
          const next = new Map(prev);
          next.delete(userId);
          return next;
        });
        return false;
      }
    },
    []
  );

  const updatePrefs = useCallback(
    async (userId: string, patch: Partial<FavoritePrefs>) => {
      const prior = map.get(userId);
      if (!prior) return false;
      const optimistic = { ...prior, ...patch };
      setMap((prev) => new Map(prev).set(userId, optimistic));
      try {
        const res = await fetch(`/api/favorites/${userId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error("failed");
        return true;
      } catch {
        setMap((prev) => new Map(prev).set(userId, prior));
        return false;
      }
    },
    [map]
  );

  const removeFavorite = useCallback(
    async (userId: string) => {
      const prior = map.get(userId);
      setMap((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
      try {
        const res = await fetch(`/api/favorites/${userId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("failed");
        return true;
      } catch {
        if (prior) setMap((prev) => new Map(prev).set(userId, prior));
        return false;
      }
    },
    [map]
  );

  return (
    <FavoritesContext.Provider
      value={{
        ready,
        isFavorite,
        getPrefs,
        addFavorite,
        updatePrefs,
        removeFavorite,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error("useFavorites must be used within a FavoritesProvider");
  }
  return ctx;
}
