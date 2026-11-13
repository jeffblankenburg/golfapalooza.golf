"use client";

import { useEffect, useState } from "react";
/* eslint-disable @next/next/no-img-element */

type Phase = "visible" | "fading" | "hidden";

/** `logoUrl` is the active group's logo (set by the v2 shell via a cookie, read
 *  server-side in the root layout) so a reload greets you with YOUR app's logo,
 *  not the default. Falls back to the platform logo when there's no brand. */
export function SplashFader({ logoUrl }: { logoUrl?: string | null }) {
  const [phase, setPhase] = useState<Phase>("visible");

  useEffect(() => {
    if (phase !== "visible") return;
    const raf = requestAnimationFrame(() => setPhase("fading"));
    const safety = window.setTimeout(() => setPhase("hidden"), 800);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(safety);
    };
  }, [phase]);

  if (phase === "hidden") return null;

  return (
    <div
      id="app-splash"
      aria-hidden="true"
      className={phase === "fading" ? "app-splash--hidden" : undefined}
      onTransitionEnd={(e) => {
        if (e.propertyName === "opacity") setPhase("hidden");
      }}
    >
      <img src={logoUrl || "/logo.png"} alt="" />
      <div className="app-splash__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
