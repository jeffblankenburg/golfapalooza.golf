/**
 * A one-shot handoff of the destination group's branding from the switcher to the
 * /new loading fallback. The loading boundary sits above [slug] and can't see the
 * target route's params, so the switcher stashes {name, logo} right before
 * navigating and the fallback reads it to greet the switch with the right logo.
 * sessionStorage (same-tab, survives the client nav); honored only if very recent.
 */
const KEY = "v2:pending-group";
const MAX_AGE_MS = 8000;

export interface PendingGroup {
  name: string;
  logoUrl: string | null;
}

export function stashPendingGroup(g: PendingGroup): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...g, ts: Date.now() }));
  } catch {
    /* storage unavailable — fall back to a bare spinner */
  }
}

/** Pure read (safe to call from a render/initializer); does not clear. */
export function readPendingGroup(): PendingGroup | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { name?: string; logoUrl?: string | null; ts?: number };
    if (p && typeof p.name === "string" && typeof p.ts === "number" && Date.now() - p.ts < MAX_AGE_MS) {
      return { name: p.name, logoUrl: p.logoUrl ?? null };
    }
  } catch {
    /* ignore malformed */
  }
  return null;
}

export function clearPendingGroup(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
