"use client";

import { useEffect, useState } from "react";

type Phase = "visible" | "fading" | "hidden";

export function SplashFader() {
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
      <img src="/logo.png" alt="" />
      <div className="app-splash__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
