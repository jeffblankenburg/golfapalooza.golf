"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Debounced auto-save. Watches `value`; whenever it changes, schedules a background
 * save after `delay`. No Save button anywhere ([[feedback_autosave_everywhere]]).
 *
 * Robust against edits landing mid-flight: the in-flight save compares a serialized
 * snapshot to the current value and only reports "saved" when nothing changed since.
 * `save` should throw (or reject) on failure; its message surfaces in the chip.
 *
 * `flush()` saves any pending change immediately (skipping the debounce) — call it on
 * modal close / before navigation so a quick edit-then-close never slips through the
 * debounce window. Pending changes are also flushed automatically on unmount.
 */
export function useAutoSave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  opts?: { delay?: number; serialize?: (v: T) => string },
): { state: SaveState; error: string | null; retry: () => void; flush: () => void } {
  const delay = opts?.delay ?? 700;
  const serialize = opts?.serialize ?? ((v: T) => JSON.stringify(v));

  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const valueRef = useRef(value);
  const saveRef = useRef(save);
  const serializeRef = useRef(serialize);
  const lastSaved = useRef<string>(serialize(value)); // initial value is the saved baseline
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  // Latest-ref pattern: keep the deferred save pointed at the current value/callbacks.
  // Declared before the debounce effect so these are current when it reads them.
  useEffect(() => {
    valueRef.current = value;
    saveRef.current = save;
    serializeRef.current = serialize;
  });

  const run = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const snap = valueRef.current;
    const snapKey = serializeRef.current(snap);
    if (mounted.current) { setState("saving"); setError(null); }
    try {
      await saveRef.current(snap);
      lastSaved.current = snapKey;
      // Only flip to "saved" if nothing changed while the request was in flight.
      if (mounted.current) setState(serializeRef.current(valueRef.current) === snapKey ? "saved" : "saving");
    } catch (e) {
      if (mounted.current) { setError(e instanceof Error ? e.message : "Could not save"); setState("error"); }
    }
  }, []);

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (serializeRef.current(valueRef.current) !== lastSaved.current) void run();
  }, [run]);

  useEffect(() => {
    const key = serializeRef.current(value);
    if (key === lastSaved.current) return; // unchanged vs last successful save
    // Reflect "unsaved" immediately so the chip never reads a stale "saved" during the
    // debounce window. Can't cascade: `value` is unchanged this render, so no re-fire.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void run(); }, delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, delay, run]);

  // On unmount: fire any pending save (fire-and-forget, no setState) so navigating away
  // mid-debounce doesn't drop it.
  useEffect(() => () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    mounted.current = false;
    if (serializeRef.current(valueRef.current) !== lastSaved.current) void saveRef.current(valueRef.current);
  }, []);

  const retry = useCallback(() => { void run(); }, [run]);
  return { state, error, retry, flush };
}
