"use client";

import { useState } from "react";
import ContestCard, { cardStyles } from "@/app/new/_components/contest-card/ContestCard";
import { PickemPreview, SquaresPreview } from "@/app/new/_components/contest-card/previews";
import type { PickemGamePreview } from "@/lib/v2/contests/pickem-preview";
import type { SquaresContestRow } from "@/app/new/[slug]/admin/contests/SquaresEditor";
import ContestSettings, { type CourseOption } from "./[contestId]/ContestSettings";
import styles from "@/app/new/new.module.css";

/** A nested side game shown (read-only) inside a parent scramble's accordion —
 *  managed on the scramble's detail page, so not clickable here. */
export interface SideRow {
  id: string;
  type: string;
  name: string;
  meta: string; // e.g. "Skins (net), hole 7" (+ winner when set)
  right: string; // pot total or participant count, shown on the right
}

/** Everything a card needs, normalized server-side (lane-agnostic). */
export interface EventCard {
  id: string;
  type: string;
  name: string;
  meta: string;
  count?: string;
  needsAttention?: boolean;
  detailHref: string;
  facts: { label: string; value: string }[];
  sides: SideRow[];
  bodyHint?: string; // shown when there are no facts/sides
  // When present, the accordion renders the full game table (same as the group lane)
  // instead of the facts summary.
  pickemGames?: PickemGamePreview[];
  squaresRow?: SquaresContestRow;
  gear: {
    contestDate: string | null;
    startTime: string | null;
    courseId: string | null;
    teeId: string | null;
    courseName: string | null;
    entryAmountCents: number | null;
    config: Record<string, unknown> | null;
    showCourse: boolean;
  };
}

export interface DayGroup { day: string; label: string; cards: EventCard[] }

export default function EventContestsList({
  slug,
  orgId,
  eventId,
  courses,
  days,
  eventWide,
}: {
  slug: string;
  orgId: string;
  eventId: string;
  courses: CourseOption[];
  days: DayGroup[];
  eventWide: EventCard[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [gearFor, setGearFor] = useState<string | null>(null);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  function renderCard(c: EventCard) {
    const isOpen = expanded.has(c.id);
    return (
      <div key={c.id}>
        <ContestCard
          kind={c.type}
          name={c.name}
          meta={c.meta}
          count={c.count}
          detailHref={c.detailHref}
          onGear={() => setGearFor(c.id)}
          isOpen={isOpen}
          onToggle={() => toggle(c.id)}
          badge={c.needsAttention ? <span className={styles.needsAttn} style={{ marginLeft: 8 }}>Needs attention</span> : undefined}
        >
          {c.pickemGames ? (
            <PickemPreview games={c.pickemGames} />
          ) : c.squaresRow ? (
            <SquaresPreview row={c.squaresRow} />
          ) : (
          <>
          {c.facts.length > 0 && (
            <div className={cardStyles.bodyFacts}>
              {c.facts.map((f) => (
                <span key={f.label}>{f.label} <b>{f.value}</b></span>
              ))}
            </div>
          )}
          {c.sides.length > 0 && (
            <div>
              {c.sides.map((s) => (
                <div key={s.id} className={cardStyles.sideRow}>
                  <span className={cardStyles.sideMain}>
                    <span className={cardStyles.sideName}>{s.name}</span>
                    <span className={cardStyles.sideMeta}>{s.meta}</span>
                  </span>
                  {s.right && <span className={cardStyles.sideRight}>{s.right}</span>}
                </div>
              ))}
            </div>
          )}
          {c.facts.length === 0 && c.sides.length === 0 && c.bodyHint && (
            <p className={cardStyles.rowEmpty}>{c.bodyHint}</p>
          )}
          </>
          )}
        </ContestCard>

        {/* Controlled gear modal for this card (quick settings). */}
        <ContestSettings
          slug={slug}
          orgId={orgId}
          eventId={eventId}
          contestId={c.id}
          name={c.name}
          contestDate={c.gear.contestDate}
          startTime={c.gear.startTime}
          courseId={c.gear.courseId}
          teeId={c.gear.teeId}
          courseName={c.gear.courseName}
          entryAmountCents={c.gear.entryAmountCents}
          courses={courses}
          config={c.gear.config}
          showCourse={c.gear.showCourse}
          showTrigger={false}
          controlledOpen={gearFor === c.id}
          onControlledClose={() => setGearFor(null)}
        />
      </div>
    );
  }

  return (
    <>
      {days.map((d) => (
        <div key={d.day} className={styles.contestDay}>
          <div className={styles.schedDateHead}>{d.label}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {d.cards.map(renderCard)}
          </div>
        </div>
      ))}
      {eventWide.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          {eventWide.map(renderCard)}
        </div>
      )}
    </>
  );
}
