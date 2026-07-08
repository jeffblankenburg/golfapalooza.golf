"use client";

import { useState } from "react";
import { useFavorites } from "@/components/favorites/FavoritesContext";
import { FavoritePreferencesDrawer } from "@/components/favorites/FavoritePreferencesDrawer";

/**
 * Star toggle for favoriting a Loozer (issue #140). One tap opens the
 * "Following [Name]" sheet, which creates the favorite (if new) and edits
 * notification prefs. Hidden when there's no viewer or on your own identity —
 * callers should also avoid rendering it on the current user.
 */
export function FavoriteStarButton({
  favoriteUserId,
  name,
  size = "md",
  className = "",
  stopPropagation = false,
}: {
  favoriteUserId: string;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** For cards where the whole tile is a link — prevent navigating on tap. */
  stopPropagation?: boolean;
}) {
  const { isFavorite, removeFavorite } = useFavorites();
  const [open, setOpen] = useState(false);
  const active = isFavorite(favoriteUserId);

  const dim = size === "sm" ? "h-5 w-5" : size === "lg" ? "h-7 w-7" : "h-6 w-6";

  return (
    <>
      <button
        type="button"
        aria-label={active ? `Unfavorite ${name}` : `Favorite ${name}`}
        aria-pressed={active}
        onClick={(e) => {
          if (stopPropagation) {
            e.preventDefault();
            e.stopPropagation();
          }
          // Already a favorite → one tap removes it (and all its notifications),
          // no drawer. Not yet a favorite → open the drawer to favorite and
          // choose notifications.
          if (active) {
            void removeFavorite(favoriteUserId);
          } else {
            setOpen(true);
          }
        }}
        className={`inline-flex items-center justify-center active:scale-90 transition-transform ${className}`}
      >
        <svg
          className={`${dim} ${
            active ? "text-amber-400" : "text-gray-300"
          } transition-colors`}
          fill={active ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={active ? 0 : 1.75}
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.368 2.447a1 1 0 00-.364 1.118l1.287 3.957c.3.922-.755 1.688-1.54 1.118l-3.367-2.447a1 1 0 00-1.176 0l-3.367 2.447c-.784.57-1.838-.196-1.539-1.118l1.286-3.957a1 1 0 00-.363-1.118L2.343 9.385c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.951-.69l1.285-3.958z" />
        </svg>
      </button>

      {open && (
        <FavoritePreferencesDrawer
          favoriteUserId={favoriteUserId}
          name={name}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
