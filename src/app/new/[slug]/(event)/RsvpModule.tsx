"use client";

import { useCallback, useState } from "react";
import Modal from "@/app/new/_components/Modal";
import styles from "@/app/new/new.module.css";
/* eslint-disable @next/next/no-img-element */

// Mirrors the legacy RSVP model: an attendance likelihood, not a going/maybe enum.
export type Likelihood = 25 | 50 | 75 | 99;

const OPTIONS: { value: Likelihood; label: string; description: string }[] = [
  { value: 99, label: "Attending", description: "99% - I'll be there" },
  { value: 75, label: "Probable", description: "75% - Looking good" },
  { value: 50, label: "Questionable", description: "50% - Still figuring it out" },
  { value: 25, label: "Doubtful", description: "25% - Unlikely but possible" },
];

const LABEL: Record<Likelihood, string> = {
  99: "Attending",
  75: "Probable",
  50: "Questionable",
  25: "Doubtful",
};

interface Participant {
  userId: string;
  likelihood: number;
  likelihoodSetAt: string | null;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Event RSVP. Until the user responds it's a bold, pulsing brand CTA; once they
 * do it becomes a "Responses" accordion (mirrors legacy): their own response +
 * an expandable breakdown of everyone's choice grouped by likelihood. Writes to
 * /api/v2/events/[eventId]/rsvp (cookie auth on web).
 */
export default function RsvpModule({
  eventId,
  eventName,
  initialLikelihood,
  initialResponseCount,
  initialAttendingCount,
}: {
  eventId: string;
  eventName: string;
  initialLikelihood: Likelihood | null;
  initialResponseCount: number;
  initialAttendingCount: number;
}) {
  const [likelihood, setLikelihood] = useState<Likelihood | null>(initialLikelihood);
  const [responseCount, setResponseCount] = useState(initialResponseCount);
  const [attendingCount, setAttendingCount] = useState(initialAttendingCount);
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadParticipants = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/events/${eventId}/rsvp`);
      if (!res.ok) return;
      const d = await res.json();
      setParticipants(d.participants || []);
      setResponseCount(d.responseCount ?? 0);
      setAttendingCount(d.attendingCount ?? 0);
      setLikelihood(d.likelihood ?? null);
    } catch {
      /* ignore */
    }
  }, [eventId]);

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next && participants === null) loadParticipants();
  }

  // Optimistic: reflect the choice immediately, write in the background, revert on error.
  function choose(next: Likelihood) {
    const prev = likelihood, prevResp = responseCount, prevAtt = attendingCount;
    setError(null);
    setLikelihood(next);
    setOpen(false);
    setParticipants(null); // breakdown reloads lazily next time it's expanded
    if (prev === null) setResponseCount((c) => c + 1);
    setAttendingCount((c) => c + (next === 99 ? 1 : 0) - (prev === 99 ? 1 : 0));
    void (async () => {
      try {
        const res = await fetch(`/api/v2/events/${eventId}/rsvp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ likelihood: next }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setLikelihood(prev); setResponseCount(prevResp); setAttendingCount(prevAtt);
        setError("Couldn't save your RSVP. Try again.");
        setOpen(true);
      }
    })();
  }

  function clear() {
    const prev = likelihood, prevResp = responseCount, prevAtt = attendingCount;
    setError(null);
    setLikelihood(null);
    setExpanded(false);
    setParticipants(null);
    setOpen(false);
    if (prev !== null) setResponseCount((c) => Math.max(0, c - 1));
    if (prev === 99) setAttendingCount((c) => Math.max(0, c - 1));
    void (async () => {
      try {
        const res = await fetch(`/api/v2/events/${eventId}/rsvp`, { method: "DELETE" });
        if (!res.ok) throw new Error();
      } catch {
        setLikelihood(prev); setResponseCount(prevResp); setAttendingCount(prevAtt);
        setError("Couldn't clear your RSVP. Try again.");
        setOpen(true);
      }
    })();
  }

  return (
    <section className={styles.module}>
      {likelihood === null ? (
        <button type="button" className={styles.rsvpPrompt} onClick={() => setOpen(true)}>
          <span className={styles.rsvpEyebrow}>{eventName}</span>
          <span className={styles.rsvpBig}>Are you in?</span>
          <span className={styles.rsvpHint}>Tap to set your status</span>
        </button>
      ) : (
        <div className={styles.rsvpCard}>
          <button type="button" className={styles.rsvpAccordionHead} onClick={toggleExpanded}>
            <span className={styles.rsvpAccordionTitle}>
              Responses <span className={styles.rsvpCount}>({responseCount})</span>
              <span className={styles.rsvpAttending}>
                Attending <span className={styles.rsvpCount}>({attendingCount})</span>
              </span>
            </span>
            <svg
              className={styles.rsvpChevron}
              data-open={expanded || undefined}
              width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          <button type="button" className={styles.rsvpYours} onClick={() => setOpen(true)}>
            <span className={styles.rsvpYoursLabel}>Your response</span>
            <span className={styles.rsvpYoursValue}>
              <span className={styles.rsvpDot} data-likelihood={likelihood} aria-hidden />
              {LABEL[likelihood]} {likelihood}%
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
              </svg>
            </span>
          </button>

          {expanded && (
            <div className={styles.rsvpGroups}>
              {participants === null ? (
                <p className={styles.rsvpLoading}>Loading…</p>
              ) : (
                OPTIONS.map((o) => {
                  const group = participants
                    .filter((p) => p.likelihood === o.value)
                    .sort((a, b) => (b.likelihoodSetAt || "").localeCompare(a.likelihoodSetAt || ""));
                  if (group.length === 0) return null;
                  return (
                    <div key={o.value} className={styles.rsvpGroup}>
                      <p className={styles.rsvpGroupLabel}>
                        {o.label} {o.value}% ({group.length})
                      </p>
                      <div className={styles.rsvpChips}>
                        {group.map((p) => (
                          <span key={p.userId} className={styles.rsvpChip}>
                            {p.avatarUrl ? (
                              <img src={p.avatarUrl} alt="" className={styles.rsvpChipAvatar} />
                            ) : (
                              <span className={styles.rsvpChipFallback}>
                                {p.displayName.charAt(0).toUpperCase()}
                              </span>
                            )}
                            {p.displayName}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      <Modal open={open} title="How likely are you?" onClose={() => setOpen(false)}>
        <div className={styles.rsvpOptions}>
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={styles.rsvpOption}
              data-selected={likelihood === o.value || undefined}
             
              onClick={() => choose(o.value)}
            >
              <span className={styles.rsvpOptionDot} data-likelihood={o.value} aria-hidden />
              <span className={styles.rsvpOptionText}>
                <span className={styles.rsvpOptionLabel}>{o.label}</span>
                <span className={styles.rsvpOptionSub}>{o.description}</span>
              </span>
              {likelihood === o.value && <span className={styles.rsvpCheck} aria-hidden>✓</span>}
            </button>
          ))}
          {likelihood !== null && (
            <button type="button" className={styles.rsvpClear} onClick={clear}>
              Clear my choice
            </button>
          )}
          {error && <p className={styles.formError}>{error}</p>}
        </div>
      </Modal>
    </section>
  );
}
