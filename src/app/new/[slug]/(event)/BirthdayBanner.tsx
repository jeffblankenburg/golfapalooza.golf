"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { pickBirthdaySubtitle } from "@/lib/v2/birthday";
import styles from "@/app/new/new.module.css";
/* eslint-disable @next/next/no-img-element */

export interface BirthdayPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  age: number;
}

const BALLOON_EMOJIS = ["🎈", "🎉", "🎂"];
const BALLOON_COUNT = 9;

interface Balloon {
  emoji: string;
  left: string;
  size: string;
  duration: string;
  delay: string;
}

/** Jittered balloons spread across the card width; stable within a mount. */
function generateBalloons(): Balloon[] {
  const slot = 100 / BALLOON_COUNT;
  return Array.from({ length: BALLOON_COUNT }, (_, i) => {
    const center = slot * (i + 0.5);
    const jitter = (Math.random() - 0.5) * slot * 0.7;
    const left = Math.max(2, Math.min(96, center + jitter));
    return {
      emoji: BALLOON_EMOJIS[Math.floor(Math.random() * BALLOON_EMOJIS.length)],
      left: `${left.toFixed(1)}%`,
      size: `${(18 + Math.random() * 14).toFixed(1)}px`,
      duration: `${(3.8 + Math.random() * 2).toFixed(2)}s`,
      delay: `${(Math.random() * 3.5).toFixed(2)}s`,
    };
  });
}

/** Home-page birthday banner. Renders nothing unless it's someone's birthday.
 *  Each card taps through to the 12-month birthday calendar. */
export default function BirthdayBanner({
  birthdays,
  slug,
}: {
  birthdays: BirthdayPerson[];
  slug: string;
}) {
  if (birthdays.length === 0) return null;
  return (
    <section className={styles.module}>
      <div className={styles.birthdayStack}>
        {birthdays.map((b) => (
          <Link
            key={b.id}
            href={`/new/${slug}/birthdays`}
            className={styles.birthdayLink}
          >
            <BirthdayCard person={b} />
          </Link>
        ))}
      </div>
    </section>
  );
}

function BirthdayCard({ person }: { person: BirthdayPerson }) {
  // Deterministic first paint, then randomize (avoids hydration mismatch).
  const [subtitle, setSubtitle] = useState(`Turning ${person.age} today!`);
  const [balloons, setBalloons] = useState<Balloon[]>([]);

  useEffect(() => {
    // Defer past the effect body (randomize only after the deterministic first
    // paint) so there's no hydration mismatch and no synchronous cascade.
    const raf = requestAnimationFrame(() => {
      setSubtitle(pickBirthdaySubtitle(person.age));
      setBalloons(generateBalloons());
    });
    return () => cancelAnimationFrame(raf);
  }, [person.age]);

  return (
    <div className={styles.birthdayCard}>
      <div className={styles.birthdayBalloons} aria-hidden>
        {balloons.map((b, i) => (
          <span
            key={i}
            className={styles.balloon}
            style={
              {
                "--left": b.left,
                "--size": b.size,
                "--dur": b.duration,
                "--delay": b.delay,
              } as React.CSSProperties
            }
          >
            {b.emoji}
          </span>
        ))}
      </div>

      {person.avatarUrl ? (
        <img src={person.avatarUrl} alt="" className={styles.birthdayAvatar} />
      ) : (
        <div className={styles.birthdayAvatarFallback}>
          {person.name[0]?.toUpperCase() || "?"}
        </div>
      )}

      <div className={styles.birthdayContent}>
        <p className={styles.birthdayTitle}>🎂 Happy birthday, {person.name}!</p>
        <p className={styles.birthdaySubtitle}>{subtitle}</p>
      </div>
    </div>
  );
}
