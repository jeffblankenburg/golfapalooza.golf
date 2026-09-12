"use client";

import { useEffect } from "react";

/**
 * Registers the existing /sw.js on load so /new/<slug> has a service worker in
 * scope (helps PWA installability + enables push). Idempotent and identical to
 * the SW the legacy app already registers — this does not modify the SW or the
 * original site. Registration alone never prompts for notification permission.
 */
export default function PwaRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
