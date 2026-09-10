"use client";

import { useSyncExternalStore } from "react";
import styles from "./pwa-install.module.css";

/**
 * Home-page "install the app" nudge. Platform-split, because install works
 * differently per OS:
 *   - Android / Chromium: capture the `beforeinstallprompt` event and expose a
 *     real Install button that fires the native prompt.
 *   - iOS Safari: no install API exists, so we show the Share → Add to Home
 *     Screen instructions instead (only Safari can A2HS on iOS).
 * Hidden entirely when already installed (standalone), when no install path is
 * available, or once dismissed. State is read through useSyncExternalStore so the
 * server snapshot is always "none" (no hydration flash) and the deferred prompt
 * event / dismissal notify subscribers without a setState-in-effect.
 */

type Mode = "android" | "ios" | "none";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "v2_pwa_install_dismissed";

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let listeners: Array<() => void> = [];
let started = false;

function notify() {
  for (const l of listeners) l();
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    // Prevent Chrome's mini-infobar so we can present our own button.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    try {
      localStorage.setItem(DISMISS_KEY, "true");
    } catch {
      /* ignore */
    }
    notify();
  });
}

function subscribe(cb: () => void) {
  start();
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    ("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone === true)
  );
}
function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isIOSSafari(): boolean {
  // Only Safari can Add to Home Screen on iOS — exclude Chrome/Firefox/Edge iOS.
  const ua = navigator.userAgent;
  return isIOS() && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function snapshot(): Mode {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "none";
  if (isStandalone()) return "none";
  try {
    if (localStorage.getItem(DISMISS_KEY) === "true") return "none";
  } catch {
    /* ignore */
  }
  if (deferredPrompt) return "android";
  if (isIOSSafari()) return "ios";
  return "none";
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, "true");
  } catch {
    /* ignore */
  }
  notify();
}

async function install() {
  const dp = deferredPrompt;
  if (!dp) return;
  await dp.prompt();
  try {
    await dp.userChoice;
  } catch {
    /* ignore */
  }
  deferredPrompt = null;
  notify();
}

export default function PwaInstallBanner({ appName }: { appName: string }) {
  const mode = useSyncExternalStore<Mode>(subscribe, snapshot, () => "none");
  if (mode === "none") return null;

  return (
    <div className={styles.banner} role="note">
      <span className={styles.icon} aria-hidden>
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <rect x="7" y="2" width="10" height="20" rx="2.5" />
          <path d="M11 18h2" />
        </svg>
      </span>

      <div className={styles.body}>
        <p className={styles.title}>Install {appName}</p>
        {mode === "android" ? (
          <p className={styles.sub}>Add it to your home screen for full-screen, offline-ready access.</p>
        ) : (
          <p className={styles.sub}>
            Tap the Share icon
            <span className={styles.share} aria-hidden>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M12 16V4M8 8l4-4 4 4M6 12v6a2 2 0 002 2h8a2 2 0 002-2v-6" />
              </svg>
            </span>
            then <strong>Add to Home Screen</strong>.
          </p>
        )}
      </div>

      {mode === "android" && (
        <button type="button" className={styles.install} onClick={install}>
          Install
        </button>
      )}
      <button type="button" className={styles.close} onClick={dismiss} aria-label="Dismiss">
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
