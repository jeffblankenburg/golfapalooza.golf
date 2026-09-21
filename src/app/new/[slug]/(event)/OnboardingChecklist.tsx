"use client";

import { useState } from "react";
import Link from "next/link";
import type { OnboardingStep } from "@/lib/v2/onboarding";
import styles from "./OnboardingChecklist.module.css";

/**
 * "Get your group ready" first-run checklist (#196). Admin-only card on the group
 * home; each unfinished step deep-links to the real admin surface. Dismissible
 * (per-org) and auto-hidden once every step is done — computed server-side in
 * getOnboardingState, so it never traps the admin.
 */
export default function OnboardingChecklist({
  orgId,
  steps,
  completed,
  total,
}: {
  orgId: string;
  steps: OnboardingStep[];
  completed: number;
  total: number;
}) {
  const [hidden, setHidden] = useState(false);

  async function dismiss() {
    setHidden(true); // optimistic; a failed PATCH just means it returns next load
    try {
      await fetch(`/api/v2/orgs/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding_dismissed: true }),
      });
    } catch {
      /* best-effort — worst case the card reappears */
    }
  }

  if (hidden) return null;

  return (
    <section className={styles.card}>
      <div className={styles.head}>
        <h2 className={styles.title}>Get your group ready</h2>
        <span className={styles.count}>
          {completed}/{total}
        </span>
      </div>

      <div className={styles.track} aria-hidden>
        <div className={styles.fill} style={{ width: `${(completed / total) * 100}%` }} />
      </div>

      <ul className={styles.list}>
        {steps.map((s) => {
          const inner = (
            <>
              <span className={styles.mark} data-done={s.done || undefined} aria-hidden>
                {s.done ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : null}
              </span>
              <span className={styles.body}>
                <span className={styles.label} data-done={s.done || undefined}>
                  {s.label}
                </span>
                <span className={styles.desc}>{s.desc}</span>
              </span>
              {!s.done && (
                <svg className={styles.arrow} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 5l7 7-7 7" />
                </svg>
              )}
            </>
          );
          return (
            <li key={s.key}>
              {s.done || !s.href ? (
                <div className={styles.row} data-done={s.done || undefined}>
                  {inner}
                </div>
              ) : (
                <Link href={s.href} className={styles.row}>
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <button type="button" className={styles.dismiss} onClick={dismiss}>
        Dismiss
      </button>
    </section>
  );
}
