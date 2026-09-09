"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import styles from "@/app/new/new.module.css";
/* eslint-disable @next/next/no-img-element */

export interface Ad {
  id: string;
  image_url: string;
  alt_text: string | null;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Sponsor ad carousel (mirrors the legacy FakeAdCarousel): shuffles, caps to a
 * few, auto-advances, supports swipe + dots. Display-only (no click-through yet).
 * Renders nothing when there are no ads.
 */
export default function AdCarousel({
  ads,
  maxAds = 3,
  intervalMs = 10000,
}: {
  ads: Ad[];
  maxAds?: number;
  intervalMs?: number;
}) {
  // Shuffle + cap once after mount (stable within a session; avoids SSR mismatch).
  const [picked, setPicked] = useState<Ad[]>([]);
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPicked(shuffle(ads).slice(0, maxAds)));
    return () => cancelAnimationFrame(raf);
  }, [ads, maxAds]);

  const advance = useCallback(() => {
    setIndex((i) => (picked.length ? (i + 1) % picked.length : 0));
  }, [picked.length]);

  useEffect(() => {
    if (picked.length <= 1) return;
    const t = setInterval(advance, intervalMs);
    return () => clearInterval(t);
  }, [advance, picked.length, intervalMs]);

  if (picked.length === 0) return null;
  const current = picked[index];

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 40) {
      setIndex((i) =>
        diff < 0
          ? (i + 1) % picked.length
          : (i - 1 + picked.length) % picked.length,
      );
    }
    touchStartX.current = null;
  };

  return (
    <section className={styles.module} aria-label="Featured sponsors">
      <div className={styles.adFrame} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <img src={current.image_url} alt={current.alt_text || "Featured sponsor"} />
      </div>
      {picked.length > 1 && (
        <div className={styles.adDots}>
          {picked.map((_, i) => (
            <button
              key={i}
              type="button"
              className={styles.adDot}
              data-active={i === index || undefined}
              onClick={() => setIndex(i)}
              aria-label={`Show ad ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
