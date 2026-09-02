"use client";

import { useSyncExternalStore } from "react";

const DISMISS_KEY = "golfapalooza_android_bg_audio_hint_dismissed";

// The banner's visibility is derived from browser state (user agent, install
// mode, a localStorage dismissal flag) — none of which exists during SSR. We
// read it through useSyncExternalStore so the server snapshot is always
// `false` (no hydration flash) and `dismiss()` can notify subscribers to
// re-read without a setState-in-effect. Env doesn't change during a session,
// so `subscribe` only needs to fire for our own dismissal.
let listeners: Array<() => void> = [];
function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}
function notify() {
  for (const l of listeners) l();
}

function shouldShowSnapshot(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isInstalled = window.matchMedia?.("(display-mode: standalone)").matches === true;
  const dismissed = localStorage.getItem(DISMISS_KEY) === "true";
  return isAndroid && !isInstalled && !dismissed;
}

/**
 * Android-only, one-time tip that helps music keep playing when the screen is
 * off or the app is backgrounded. It's the companion to the MediaSession
 * hardening in MusicPlayerContext: the code makes Android's media notification
 * "sticky," and this nudges users toward the two OS-level settings that let the
 * notification survive aggressive OEM battery management (Samsung/Xiaomi/etc.):
 *   1. Install the app (Add to Home Screen) — an installed PWA gets a far more
 *      stable background media service than a browser tab.
 *   2. Exempt it from battery optimization.
 *
 * Renders nothing on iOS/desktop (the iPhone flow is deliberately untouched),
 * nothing when already installed (running standalone), and nothing once
 * dismissed.
 */
export function AndroidBackgroundAudioHint() {
  const show = useSyncExternalStore(subscribe, shouldShowSnapshot, () => false);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "true");
    notify();
  };

  return (
    <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3">
      <div className="flex items-start gap-2">
        <svg className="mt-0.5 h-5 w-5 shrink-0 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-green-900">Keep music playing in the background</p>
          <p className="mt-1 text-xs leading-relaxed text-green-800">
            On Android, two quick settings keep the music going when your screen turns off:
          </p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-green-800">
            <li>
              Tap your browser menu → <span className="font-semibold">Add to Home screen</span> to install the app.
            </li>
            <li>
              In Android Settings → Apps → Golfapalooza → Battery, choose{" "}
              <span className="font-semibold">Unrestricted</span> (turn off battery optimization).
            </li>
          </ol>
          <button
            onClick={dismiss}
            className="mt-2 text-xs font-semibold text-green-700 underline underline-offset-2"
          >
            Got it, don&apos;t show again
          </button>
        </div>
      </div>
    </div>
  );
}
