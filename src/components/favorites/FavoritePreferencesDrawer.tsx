"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DragHandle } from "@/components/DragHandle";
import { BTN_DESTRUCTIVE } from "@/lib/ui/buttons";
import {
  useFavorites,
  DEFAULT_PREFS,
  type FavoritePrefs,
} from "@/components/favorites/FavoritesContext";

const TOGGLES: { key: keyof FavoritePrefs; label: string; hint: string }[] = [
  {
    key: "notify_round_started",
    label: "Rounds Played",
    hint: "When they start a live round",
  },
  {
    key: "notify_hole_completed",
    label: "Hole-by-Hole Updates",
    hint: "Every hole as they card it — can be chatty",
  },
  {
    key: "notify_round_completed",
    label: "Round Finished",
    hint: "When they wrap up, with their score",
  },
];

/**
 * "Following [Name]" bottom sheet (issue #140). Opening it for a not-yet
 * favorite immediately creates the favorite with all toggles on; the toggles
 * then edit prefs live. Includes an Unfavorite action at the bottom.
 */
export function FavoritePreferencesDrawer({
  favoriteUserId,
  name,
  onClose,
}: {
  favoriteUserId: string;
  name: string;
  onClose: () => void;
}) {
  const { getPrefs, addFavorite, updatePrefs, removeFavorite } = useFavorites();
  // Snapshot prefs once on mount so the toggles are stable even as the shared
  // map updates underneath us.
  const [prefs, setPrefs] = useState<FavoritePrefs>(
    () => getPrefs(favoriteUserId) ?? DEFAULT_PREFS
  );

  // Opening the sheet for a not-yet-favorite Loozer creates the favorite
  // (all toggles on). Done in an effect, never during render.
  const createdRef = useRef(false);
  useEffect(() => {
    if (!getPrefs(favoriteUserId) && !createdRef.current) {
      createdRef.current = true;
      void addFavorite(favoriteUserId, DEFAULT_PREFS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoriteUserId]);

  const toggle = (key: keyof FavoritePrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    void updatePrefs(favoriteUserId, { [key]: next[key] });
  };

  const handleUnfavorite = async () => {
    await removeFavorite(favoriteUserId);
    onClose();
  };

  // The star lives inside an `absolute z-10` card wrapper, which is a local
  // stacking context. Rendering the fixed overlay in place would trap it there
  // (and let sibling cards' stars paint over it, stealing taps). Portal to
  // <body> so the drawer escapes every local stacking context.
  if (typeof document === "undefined") return null;

  // NOTE: React routes synthetic events through the *React* tree, not the DOM
  // tree — so even though this is portaled to <body>, a backdrop click still
  // bubbles up to the <Link> card that owns the star. Stop propagation here (and
  // on the content, below) so closing the sheet never navigates to the profile.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="bg-white rounded-t-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <DragHandle onClose={onClose} className="" />
        </div>

        <div className="px-5 pb-3">
          <h3 className="text-lg font-bold text-gray-900">Following {name}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Choose the push notifications you want when {name} plays.
          </p>
        </div>

        <div className="px-5 divide-y divide-gray-100">
          {TOGGLES.map(({ key, label, hint }) => (
            <div key={key} className="flex items-center justify-between py-3.5">
              <div className="min-w-0 pr-4">
                <div className="text-base font-semibold text-gray-900">
                  {label}
                </div>
                <div className="text-xs text-gray-500">{hint}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[key]}
                aria-label={label}
                onClick={() => toggle(key)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full p-0.5 transition-colors ${
                  prefs[key]
                    ? "bg-green-600"
                    : "bg-gray-200 ring-1 ring-inset ring-gray-300"
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform ${
                    prefs[key] ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>

        <div className="px-5 py-4">
          <button onClick={handleUnfavorite} className={`${BTN_DESTRUCTIVE} w-full`}>
            Unfavorite {name}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
