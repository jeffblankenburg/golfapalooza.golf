"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { pickBannerSubtitle } from "@/lib/birthday/banner-subtitles";

interface Birthday {
  id: string;
  display_name: string;
  avatar_url: string | null;
  age: number;
}

const BALLOON_EMOJIS = ["🎈", "🎉", "🎂"];
const BALLOON_COUNT = 9;

interface BalloonConfig {
  emoji: string;
  left: string;
  size: string;
  duration: string;
  delay: string;
}

/** Randomize shapes + positions + timings. Called once per card mount so the
 *  loop stays stable within a session but looks fresh on each page load.
 *  Horizontal space is divided into BALLOON_COUNT slots, each with a jittered
 *  center, so shapes spread out instead of clumping. */
function generateBalloons(): BalloonConfig[] {
  const slotWidth = 100 / BALLOON_COUNT;
  return Array.from({ length: BALLOON_COUNT }, (_, i) => {
    const slotCenter = slotWidth * (i + 0.5);
    const jitter = (Math.random() - 0.5) * slotWidth * 0.7;
    const left = Math.max(2, Math.min(96, slotCenter + jitter));
    const size = 18 + Math.random() * 14;              // 18–32px
    const duration = 3.8 + Math.random() * 2;          // 3.8–5.8s
    const delay = Math.random() * 3.5;                 // 0–3.5s
    const emoji = BALLOON_EMOJIS[Math.floor(Math.random() * BALLOON_EMOJIS.length)];
    return {
      emoji,
      left: `${left.toFixed(1)}%`,
      size: `${size.toFixed(1)}px`,
      duration: `${duration.toFixed(2)}s`,
      delay: `${delay.toFixed(2)}s`,
    };
  });
}

export function BirthdayBanner({ initialBirthdays }: { initialBirthdays?: Birthday[] }) {
  const [birthdays, setBirthdays] = useState<Birthday[]>(initialBirthdays ?? []);

  // Only fall back to the client fetch when the server didn't prefetch for us
  // (e.g., the component is rendered somewhere without SSR data).
  useEffect(() => {
    if (initialBirthdays !== undefined) return;
    fetch("/api/birthdays/today")
      .then((r) => (r.ok ? r.json() : { birthdays: [] }))
      .then((d) => setBirthdays(d.birthdays || []))
      .catch(() => {});
  }, [initialBirthdays]);

  if (birthdays.length === 0) return null;

  return (
    <div className="space-y-2">
      {birthdays.map((b) => (
        <BirthdayCard key={b.id} birthday={b} />
      ))}
    </div>
  );
}

function BirthdayCard({ birthday: b }: { birthday: Birthday }) {
  // Pick the subtitle + balloon layout once per mount so nothing flickers on
  // re-render; both reroll on each fresh page load.
  const subtitle = useMemo(() => pickBannerSubtitle(b.age), [b.age]);
  const balloons = useMemo(() => generateBalloons(), []);

  return (
    <Link
      href={`/loozers/${b.id}`}
      className="relative flex items-center gap-4 bg-gradient-to-r from-pink-100 via-yellow-50 to-cyan-100 rounded-2xl p-4 shadow-sm active:scale-[0.98] transition-transform overflow-hidden"
    >
      {/* Floating balloon background — purely decorative */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {balloons.map((bal, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: bal.left,
              bottom: 0,
              fontSize: bal.size,
              lineHeight: 1,
              animation: `birthday-balloon-rise ${bal.duration} linear ${bal.delay} infinite`,
              animationFillMode: "backwards",
              willChange: "transform, opacity, bottom",
            }}
          >
            {bal.emoji}
          </span>
        ))}
      </div>

      {/* Content layer sits above the background */}
      {b.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={b.avatar_url}
          alt=""
          className="relative z-10 w-16 h-16 rounded-full object-cover ring-2 ring-white shadow flex-shrink-0"
        />
      ) : (
        <div className="relative z-10 w-16 h-16 rounded-full bg-pink-200 flex items-center justify-center text-pink-700 text-2xl font-bold ring-2 ring-white shadow flex-shrink-0">
          {b.display_name[0]?.toUpperCase() || "?"}
        </div>
      )}
      <div className="relative z-10 flex-1 min-w-0">
        <p className="text-base font-bold text-gray-900 leading-snug">
          🎂 Happy birthday, {b.display_name}!
        </p>
        <p className="text-sm text-gray-600 leading-snug">{subtitle}</p>
      </div>
    </Link>
  );
}
