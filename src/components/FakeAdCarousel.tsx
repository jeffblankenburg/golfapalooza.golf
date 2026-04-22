"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface FakeAd {
  id: string;
  image_url: string;
  alt_text: string | null;
  tagged_user_ids: string[];
}

interface FakeAdCarouselProps {
  /** If set, fetches only ads tagged with this Loozer (for profile pages). */
  userId?: string;
  /** If false, ads render non-clickable. Profile pages pass false. */
  clickable?: boolean;
  /** Link prefix for a Loozer profile. Defaults to /loozers. Spectator pages pass /spectator/loozers. */
  profileHref?: string;
  /** Auto-advance interval in ms. Default 10000. */
  intervalMs?: number;
  /** Cap the number of ads in the rotation (chosen randomly after shuffle).
   *  Undefined = no cap. Home page passes 3. */
  maxAds?: number;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function FakeAdCarousel({
  userId,
  clickable = true,
  profileHref = "/loozers",
  intervalMs = 10000,
  maxAds,
}: FakeAdCarouselProps) {
  const [ads, setAds] = useState<FakeAd[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState(0);
  // For multi-tag ads: pre-pick a random tagged user per ad so the href is stable across renders.
  const [pickedUserByAd, setPickedUserByAd] = useState<Record<string, string>>({});
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const qs = userId ? `?userId=${userId}` : "";
    fetch(`/api/fake-ads${qs}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.ads)) {
          const shuffled = shuffle<FakeAd>(data.ads);
          const capped = maxAds != null ? shuffled.slice(0, maxAds) : shuffled;
          setAds(capped);
          const picks: Record<string, string> = {};
          for (const ad of capped) {
            if (ad.tagged_user_ids.length > 0) {
              picks[ad.id] = ad.tagged_user_ids[Math.floor(Math.random() * ad.tagged_user_ids.length)];
            }
          }
          setPickedUserByAd(picks);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [userId, maxAds]);

  const advance = useCallback(() => {
    setIndex((i) => (ads.length ? (i + 1) % ads.length : 0));
  }, [ads.length]);

  useEffect(() => {
    if (ads.length <= 1) return;
    const t = setInterval(advance, intervalMs);
    return () => clearInterval(t);
  }, [advance, ads.length, intervalMs]);

  if (!loaded || ads.length === 0) return null;

  const current = ads[index];

  const resolveHref = (ad: FakeAd): string | null => {
    if (!clickable || ad.tagged_user_ids.length === 0) return null;
    const pick = pickedUserByAd[ad.id] || ad.tagged_user_ids[0];
    return `${profileHref}/${pick}`;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 40) {
      if (diff < 0) setIndex((i) => (i + 1) % ads.length);
      else setIndex((i) => (i - 1 + ads.length) % ads.length);
    }
    touchStartX.current = null;
  };

  const href = resolveHref(current);

  const inner = (
    <img
      src={current.image_url}
      alt={current.alt_text || "Featured sponsor"}
      className="w-full h-full object-cover block"
    />
  );

  return (
    <div className="w-full" aria-label="Featured sponsors">
      <div
        className="relative overflow-hidden rounded-xl border border-gray-200 shadow-sm bg-white aspect-[3/1]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {href ? (
          <Link href={href} className="block w-full h-full active:opacity-90 transition-opacity">
            {inner}
          </Link>
        ) : (
          inner
        )}
      </div>
      {ads.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {ads.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-4 bg-green-600" : "w-1.5 bg-gray-300"
              }`}
              aria-label={`Show ad ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
