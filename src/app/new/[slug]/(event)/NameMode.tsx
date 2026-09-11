"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { NameMode } from "@/lib/v2/profile";

/** The org's member-name display mode, provided once at the event layout so any
 *  client surface can format names consistently without prop-drilling. Defaults
 *  to 'nickname' outside a provider (safe: matches stored display_name). */
const NameModeContext = createContext<NameMode>("nickname");

export function NameModeProvider({ mode, children }: { mode: NameMode; children: ReactNode }) {
  return <NameModeContext.Provider value={mode}>{children}</NameModeContext.Provider>;
}

export function useNameMode(): NameMode {
  return useContext(NameModeContext);
}
