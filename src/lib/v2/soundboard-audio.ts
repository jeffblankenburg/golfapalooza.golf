/**
 * Soundboard audio engine (client-only). A single shared Web Audio context with
 * an in-memory AudioBuffer cache so taps play instantly, overlap/layer freely,
 * and need no network fetch after the first decode.
 *
 * Mobile browsers won't play audio until a user gesture; call `unlockAudio()`
 * from the first interaction anywhere in the app so even passive receivers (who
 * never tap the board) can hear a blast. Falls back to an <audio> element if Web
 * Audio is unavailable.
 */

let ctx: AudioContext | null = null;
let unlocked = false;
const buffers = new Map<string, AudioBuffer>();
const pending = new Map<string, Promise<AudioBuffer | null>>();

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Resume + prime the context on a user gesture (idempotent, cheap to spam). */
export function unlockAudio(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume().catch(() => {});
  // A 1-sample silent buffer fully unlocks playback on iOS Safari.
  try {
    const b = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = b;
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* no-op */
  }
  unlocked = true;
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

async function loadBuffer(url: string): Promise<AudioBuffer | null> {
  const c = getCtx();
  if (!c) return null;
  const cached = buffers.get(url);
  if (cached) return cached;
  const inFlight = pending.get(url);
  if (inFlight) return inFlight;

  const p = (async () => {
    try {
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      const buf = await c.decodeAudioData(arr);
      buffers.set(url, buf);
      return buf;
    } catch {
      return null;
    } finally {
      pending.delete(url);
    }
  })();
  pending.set(url, p);
  return p;
}

/** Warm the cache for a set of clips (operators call this on drawer open). */
export function preloadSounds(urls: string[]): void {
  for (const u of urls) void loadBuffer(u);
}

/** Play a clip now. Instant from cache; overlaps other plays; async-decodes on miss. */
export async function playSound(url: string): Promise<void> {
  const c = getCtx();
  if (!c) {
    try {
      await new Audio(url).play();
    } catch {
      /* no-op */
    }
    return;
  }
  if (c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      /* no-op */
    }
  }
  const buf = await loadBuffer(url);
  if (!buf) {
    try {
      await new Audio(url).play();
    } catch {
      /* no-op */
    }
    return;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  src.start(0);
}

/** One clip's length in ms (decodes on miss; null if it can't be loaded). Used to
 *  sequence sounds back-to-back (e.g. a reaction sound before the cash register). */
export async function soundDurationMs(url: string): Promise<number | null> {
  const buf = await loadBuffer(url);
  return buf ? Math.round(buf.duration * 1000) : null;
}

/** Length in ms if the clip is ALREADY decoded/cached, else null — a synchronous
 *  lookup so callers can schedule without awaiting (preload warms the cache). */
export function cachedSoundDurationMs(url: string): number | null {
  const buf = buffers.get(url);
  return buf ? Math.round(buf.duration * 1000) : null;
}

/** Drop a clip from the cache (e.g. after it's deleted/replaced). */
export function evictSound(url: string): void {
  buffers.delete(url);
  pending.delete(url);
}
