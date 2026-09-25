"use client";

import { createContext, useContext, useState } from "react";

/**
 * Client-side bridge to the time simulator. The server seeds `serverNowMs` (its
 * effective now, honoring the sim) at render; we capture the offset from the real
 * browser clock once, so any client component can read the simulated "now" without
 * a round-trip. Offset ≈ 0 when the simulator is off.
 */
const SimOffsetContext = createContext<number>(0);

export function SimTimeProvider({ serverNowMs, children }: { serverNowMs: number; children: React.ReactNode }) {
  const [offset] = useState(() => serverNowMs - Date.now());
  return <SimOffsetContext.Provider value={offset}>{children}</SimOffsetContext.Provider>;
}

/** The sim offset in ms (simulated-now minus real-now). */
export function useSimOffset(): number {
  return useContext(SimOffsetContext);
}

/** The effective "now" as a Date, honoring the simulator. */
export function useSimNow(): Date {
  return new Date(Date.now() + useContext(SimOffsetContext));
}
