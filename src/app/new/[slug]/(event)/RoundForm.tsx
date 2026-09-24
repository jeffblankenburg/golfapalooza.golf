"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import CourseLookupModal from "@/components/v2/courses/CourseLookupModal";
import styles from "@/app/new/new.module.css";
import { formatCourseName } from "@/lib/v2/course-display";
import { getTeeDotStyle, TEE_HEX_COLORS } from "@/lib/utils/tee-colors";
import type { CSSProperties } from "react";

const MAX_PLAYERS = 5;

// A small color chip for a tee box (matches the Courses page dots).
function TeeDot({ color }: { color: string | null }) {
  const { className, style } = getTeeDotStyle(color);
  return <span className={`${styles.teeDot} ${className || ""}`} style={style} />;
}

// Tint a summary pill with the player's tee color: contrast text, a border for
// light tees, and the split gradient for composition tees. Returns undefined for
// unknown/unset colors so the pill keeps its default brand style.
function pillTeeStyle(teeColor: string | null | undefined): CSSProperties | undefined {
  if (!teeColor) return undefined;
  if (teeColor.includes("/")) {
    const [a, b] = teeColor.split("/").map((c) => c.trim());
    const h1 = TEE_HEX_COLORS[a] || "#9ca3af";
    const h2 = TEE_HEX_COLORS[b] || h1;
    return { background: `linear-gradient(135deg, ${h1} 50%, ${h2} 50%)`, color: "#fff", border: "1px solid transparent" };
  }
  const hex = /^#[0-9a-fA-F]{6}$/.test(teeColor) ? teeColor : TEE_HEX_COLORS[teeColor] || TEE_HEX_COLORS[teeColor.toLowerCase()];
  if (!hex) return undefined;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const bl = parseInt(hex.slice(5, 7), 16);
  const light = (0.299 * r + 0.587 * g + 0.114 * bl) / 255 > 0.6;
  return { background: hex, color: light ? "#111827" : "#fff", border: light ? "1px solid #d1d5db" : "1px solid transparent" };
}

interface TeeOption {
  id: string;
  tee_name: string;
  tee_color: string | null;
  gender: string | null;
  course_rating: number | null;
  slope_rating: number | null;
}

// A CSS-styled dropdown for tees — replaces the native <select> so it matches
// the wizard's look (color chip, women's tag, rating). Closes on select or
// outside click.
function TeeSelect({
  tees,
  value,
  placeholder,
  onChange,
}: {
  tees: TeeOption[];
  value: string;
  placeholder: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const sel = tees.find((t) => t.id === value) || null;
  const rating = (t: TeeOption) =>
    t.course_rating != null && t.slope_rating != null ? `${t.course_rating.toFixed(1)}/${t.slope_rating}` : null;

  return (
    <div className={styles.teeSelect} ref={ref}>
      <button
        type="button"
        className={styles.teeSelectControl}
        data-open={open || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {sel ? (
          <span className={styles.teeSelectValue}>
            <TeeDot color={sel.tee_color} />
            <span className={styles.teeSelectName}>{sel.tee_name}</span>
            {sel.gender === "women" && <span className={styles.teeWMark}>W</span>}
            {rating(sel) && <span className={styles.teeSelectMeta}>{rating(sel)}</span>}
          </span>
        ) : (
          <span className={styles.teeSelectPlaceholder}>{placeholder}</span>
        )}
        <svg className={styles.teeSelectChev} width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className={styles.teeSelectMenu} role="listbox">
          {tees.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={t.id === value}
              className={styles.teeSelectOption}
              data-on={t.id === value || undefined}
              onClick={() => {
                onChange(t.id);
                setOpen(false);
              }}
            >
              <TeeDot color={t.tee_color} />
              <span className={styles.teeSelectName}>{t.tee_name}</span>
              {t.gender === "women" && <span className={styles.teeWMark}>W</span>}
              {rating(t) && <span className={styles.teeSelectMeta}>{rating(t)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface CourseHit {
  id: string;
  name: string;
  club_name: string | null;
  city: string | null;
  state: string | null;
  distance_mi?: number | null;
}
interface Tee {
  id: string;
  tee_name: string;
  tee_color: string | null;
  gender: string | null;
  course_rating: number | null;
  slope_rating: number | null;
  par: number;
}

// A tee's display name, concisely tagged for women's sets (men's and women's
// often share a color, e.g. "Red"). "(W)" keeps the option lists tight.
function teeLabel(t: { tee_name: string; gender: string | null }): string {
  return t.gender === "women" ? `${t.tee_name} (W)` : t.tee_name;
}
interface Member {
  userId: string;
  displayName: string;
  search?: string;
}
interface Player {
  key: string;
  label: string;
  user_id?: string;
  guest_name?: string;
  self?: boolean;
}

type RoundType = "18" | "9-front" | "9-back";

const STEPS = [
  { key: "course", label: "Course" },
  { key: "details", label: "Details" },
  { key: "players", label: "Players" },
  { key: "tees", label: "Tees" },
  { key: "games", label: "Games" },
  { key: "score", label: "Score" },
];

interface GameDraft {
  key: string;
  type: "skins" | "nassau";
  isNet: boolean;
  value: number | null; // optional $ stake (per skin / per bet)
  participantKeys: string[]; // Player.key of those in this game
}

const GAME_LABEL: Record<GameDraft["type"], string> = { skins: "Skins", nassau: "Nassau" };
const GAME_DESC: Record<GameDraft["type"], string> = {
  skins: "Low score wins the hole. Ties carry over, so the next hole is worth more.",
  nassau: "Match play as three bets: the front 9, the back 9, and the full 18.",
};

// Nassau is 1-on-1, so a pair is identified regardless of order.
const pairKey = (a: string, b: string) => [a, b].sort().join("|");

/**
 * Log a round — a 5-step wizard mirroring the legacy flow:
 *   1) Course  2) Date/Holes/Format  3) Players  4) Tees (per player)  5) Score.
 * Gross NEVER appears before the final step. Rendered in place of the list inside
 * RoundsDrawer; the header +/× (EventShell) opens/closes it.
 */
export default function RoundForm({
  orgId,
  onDone,
  onCloseDrawer,
}: {
  orgId: string;
  onDone: () => void;
  onCloseDrawer: () => void;
}) {
  const [step, setStep] = useState(0);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CourseHit[]>([]);
  const [hitsQuery, setHitsQuery] = useState("");
  const [suggested, setSuggested] = useState<CourseHit[]>([]);
  const [basis, setBasis] = useState<"nearby" | "recent">("recent");
  const [course, setCourse] = useState<CourseHit | null>(null);
  const [tees, setTees] = useState<Tee[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [roundType, setRoundType] = useState<RoundType>("18");
  const [format, setFormat] = useState<"individual" | "scramble">("individual");
  const [members, setMembers] = useState<Member[]>([]);
  const [players, setPlayers] = useState<Player[]>([{ key: "me", label: "You", self: true }]);
  const [teeByPlayer, setTeeByPlayer] = useState<Record<string, string>>({});
  const [games, setGames] = useState<GameDraft[]>([]);
  const [grossByPlayer, setGrossByPlayer] = useState<Record<string, string>>({});
  const [playerSearch, setPlayerSearch] = useState("");
  const [guestName, setGuestName] = useState("");
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);
  const [showLookup, setShowLookup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Final step: pick how to score. "choose" shows the three options; "total"
  // reveals the quick gross inputs. Hole-by-hole/live navigate straight out.
  const [scoreMode, setScoreMode] = useState<"choose" | "total">("choose");
  const router = useRouter();
  const slug = (useParams()?.slug as string) || "";
  const courseBoxRef = useRef<HTMLDivElement>(null);

  const loadSuggested = useCallback(async (lat?: number, lng?: number) => {
    const qs = lat != null && lng != null ? `?lat=${lat}&lng=${lng}` : "";
    try {
      const res = await fetch(`/api/v2/courses/suggested${qs}`);
      const d = res.ok ? await res.json() : { courses: [], basis: "recent" };
      setSuggested(d.courses || []);
      setBasis(d.basis === "nearby" ? "nearby" : "recent");
    } catch {
      /* ignore */
    }
  }, []);

  // Default to recently played — location is opt-in (no auto-prompt).
  useEffect(() => {
    void (async () => {
      await loadSuggested();
    })();
  }, [loadSuggested]);

  // Org roster for the Players step. Fetch with the caller included so we can
  // label the "me" row with the golfer's real name (instead of "You"); the
  // addable list still excludes them (they're already on the roster).
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/v2/chat/members?orgId=${orgId}&includeSelf=1`);
        const d = res.ok ? await res.json() : { members: [], viewerId: null };
        if (cancelled) return;
        const all: Member[] = d.members || [];
        const me = all.find((m) => m.userId === d.viewerId);
        if (me) setPlayers((prev) => prev.map((p) => (p.self ? { ...p, label: me.displayName } : p)));
        setMembers(all.filter((m) => m.userId !== d.viewerId));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocNote("Location isn't available on this device.");
      return;
    }
    setLocating(true);
    setLocNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
          setLocNote("Couldn't pin your location — showing recent courses.");
          return;
        }
        loadSuggested(latitude, longitude);
      },
      () => {
        setLocating(false);
        setLocNote("Couldn't get your location — showing recent courses.");
      },
      { timeout: 8000, maximumAge: 600000 },
    );
  }

  // Debounced course search.
  useEffect(() => {
    if (course || !q.trim()) return;
    let cancelled = false;
    const query = q.trim();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v2/courses/search?q=${encodeURIComponent(query)}`);
        const d = res.ok ? await res.json() : { courses: [] };
        if (!cancelled) {
          setHits(d.courses || []);
          setHitsQuery(query);
        }
      } catch {
        /* ignore */
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, course]);

  // Cap the course box at exactly 5.5 of the actual (variable-height) rows, so a
  // longer list peeks + scrolls. Pure CSS can't do "5.5 rows" when rows vary.
  useEffect(() => {
    const el = courseBoxRef.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (el && first) el.style.maxHeight = `${first.offsetHeight * 5.5}px`;
  }, [hits, suggested, q]);

  async function pickCourse(c: CourseHit) {
    // Advance to Details in the SAME render as selecting the course (batched), so
    // the step-1 "picked" chip never flashes before the redirect. Tees load in the
    // background for the Tees step. (A tee-less course surfaces its hint there.)
    setCourse(c);
    setHits([]);
    setTees([]);
    setStep(1);
    try {
      const res = await fetch(`/api/v2/courses/${c.id}`);
      const d = res.ok ? await res.json() : { tees: [] };
      const ts: Tee[] = d.tees || [];
      setTees(ts);
      // Default every player to the first tee.
      if (ts[0]) setTeeByPlayer((prev) => Object.fromEntries(players.map((p) => [p.key, prev[p.key] || ts[0].id])));
    } catch {
      /* ignore */
    }
  }

  function resetCourse() {
    setCourse(null);
    setTees([]);
    setQ("");
  }

  function addMember(m: Member) {
    setPlayers((prev) =>
      prev.some((p) => p.key === m.userId) || prev.length >= MAX_PLAYERS
        ? prev
        : [...prev, { key: m.userId, user_id: m.userId, label: m.displayName }],
    );
    if (tees[0]) setTeeByPlayer((prev) => ({ ...prev, [m.userId]: prev[m.userId] || tees[0].id }));
    setPlayerSearch("");
  }
  function addGuest() {
    const name = guestName.trim();
    if (!name || players.length >= MAX_PLAYERS) return;
    const key = `guest:${Date.now()}`;
    setPlayers((prev) => (prev.length >= MAX_PLAYERS ? prev : [...prev, { key, guest_name: name, label: name }]));
    if (tees[0]) setTeeByPlayer((prev) => ({ ...prev, [key]: tees[0].id }));
    setGuestName("");
  }
  function removePlayer(key: string) {
    setPlayers((prev) => prev.filter((p) => p.key !== key));
  }

  async function save() {
    if (!course || saving) return;
    const rows = players.map((p) => ({
      user_id: p.user_id ?? null,
      guest_name: p.guest_name ?? null,
      tee_id: teeByPlayer[p.key] || null,
      final_gross_score: grossByPlayer[p.key]?.trim() ? Number(grossByPlayer[p.key]) : null,
    }));
    for (const r of rows) {
      if (r.final_gross_score != null && (!Number.isFinite(r.final_gross_score) || r.final_gross_score < 18 || r.final_gross_score > 200)) {
        setError("Enter valid gross scores (18–200), or leave them blank to score later.");
        return;
      }
    }
    const roundTee = teeByPlayer[players[0]?.key] || tees[0]?.id;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: course.id,
          tee_id: roundTee,
          org_id: orgId,
          round_date: date,
          round_type: roundType,
          format,
          players: rows,
          // Side games ride along, referencing players by index into `rows`.
          games: games
            .filter((g) => g.participantKeys.length >= 2)
            .map((g) => ({
              game_type: g.type,
              is_net: g.isNet,
              value: g.value && g.value > 0 ? g.value : null,
              participants: g.participantKeys.map((k) => players.findIndex((p) => p.key === k)).filter((i) => i >= 0),
            })),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Could not save the round.");
        setSaving(false);
        return;
      }
      onDone();
    } catch {
      setError("Something went wrong.");
      setSaving(false);
    }
  }

  // Hole-by-hole / live: create an in-progress round (no gross) and open the
  // full-screen scorer. Both modes share one scorer (it's realtime-capable);
  // the choice is about how the golfer plans to enter scores.
  async function startScoring(silent: boolean) {
    if (!course || saving) return;
    const rows = players.map((p) => ({
      user_id: p.user_id ?? null,
      guest_name: p.guest_name ?? null,
      tee_id: teeByPlayer[p.key] || null,
      final_gross_score: null,
    }));
    const roundTee = teeByPlayer[players[0]?.key] || tees[0]?.id;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: course.id,
          tee_id: roundTee,
          org_id: orgId,
          round_date: date,
          round_type: roundType,
          format,
          players: rows,
          silent,
          // Side games ride along, referencing players by index into `rows`.
          games: games
            .filter((g) => g.participantKeys.length >= 2)
            .map((g) => ({
              game_type: g.type,
              is_net: g.isNet,
              value: g.value && g.value > 0 ? g.value : null,
              participants: g.participantKeys.map((k) => players.findIndex((p) => p.key === k)).filter((i) => i >= 0),
            })),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Could not start scoring.");
        setSaving(false);
        return;
      }
      const d = await res.json();
      onCloseDrawer();
      router.push(`/new/${slug}/rounds/${d.id}/score`);
    } catch {
      setError("Something went wrong.");
      setSaving(false);
    }
  }

  const searching = q.trim().length > 0;
  const results = searching ? hits : suggested;
  const memberQuery = playerSearch.trim().toLowerCase();
  const availableMembers = members.filter(
    (m) =>
      !players.some((p) => p.key === m.userId) &&
      (!memberQuery || (m.search ?? m.displayName.toLowerCase()).includes(memberQuery)),
  );
  // Whether a given step's own requirements are satisfied (so you may leave it).
  const stepComplete = (i: number) =>
    i === 0 ? !!course && tees.length > 0
    : i === 1 ? true // details (date/holes/format) always has valid defaults
    : i === 2 ? players.length > 0
    : i === 3 ? players.every((p) => teeByPlayer[p.key])
    : true;

  const canAdvance = stepComplete(step);

  // Strictly sequential: a step is reachable only once EVERY prior step is
  // complete. You can jump back to any earlier (already-completed) step to fix
  // something, but you can't skip ahead past an unfinished one.
  const canReach = (i: number) => {
    for (let j = 0; j < i; j++) if (!stepComplete(j)) return false;
    return true;
  };

  return (
    <div className={styles.roundsWrap}>
      <div className={styles.wizSteps}>
        {STEPS.map((s, i) => {
          const reachable = i === step || canReach(i);
          return (
            <button
              key={s.key}
              type="button"
              className={styles.wizStep}
              data-state={i < step ? "done" : i === step ? "current" : "todo"}
              disabled={!reachable}
              onClick={() => reachable && setStep(i)}
            >
              <span className={styles.wizSeg} />
              <span className={styles.wizStepLabel}>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Running summary of what's been built (grows each step). */}
      {step > 0 && course && (
        <div className={styles.wizSummary}>
          <p className={styles.wizSummaryCourse}>{formatCourseName(course)}</p>
          {(course.city || course.state) && (
            <p className={styles.wizSummaryLoc}>{[course.city, course.state].filter(Boolean).join(", ")}</p>
          )}
          {step >= 2 && (
            <div className={styles.wizSummaryMeta}>
              <span>
                {roundType === "18" ? "18 holes" : roundType === "9-front" ? "Front 9" : "Back 9"}
                {", "}
                {(() => {
                  const [y, m, d] = date.split("-").map(Number);
                  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                })()}
              </span>
              {format === "scramble" && <span className={styles.wizSummaryBadge}>Scramble</span>}
            </div>
          )}
          {step >= 3 && players.length > 0 && (
            <div className={styles.wizSummaryChips}>
              {players.map((p) => {
                const pt = tees.find((t) => t.id === teeByPlayer[p.key]);
                return (
                  <span
                    key={p.key}
                    className={styles.wizChip}
                    style={pt ? pillTeeStyle(pt.tee_color) : undefined}
                    title={pt ? teeLabel(pt) : undefined}
                  >
                    {p.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 1 — Course. */}
      {step === 0 && (
        <div className={styles.field}>
          <label className={styles.label}>Course</label>
          {course ? (
            <div className={styles.coursePicked}>
              <span className={styles.coursePickedName}>{formatCourseName(course)}</span>
              <button type="button" className={styles.coursePickedChange} onClick={resetCourse}>
                Change
              </button>
            </div>
          ) : (
            <>
              <input className={styles.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses…" autoFocus />
              {!searching && basis !== "nearby" && (
                <div className={styles.courseListHead}>
                  <button type="button" className={styles.courseLocBtn} onClick={useMyLocation} disabled={locating}>
                    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7z" />
                      <circle cx="12" cy="9" r="2.5" />
                    </svg>
                    {locating ? "Locating…" : "Use my location"}
                  </button>
                </div>
              )}
              {!searching && locNote && <p className={styles.roundFormHint}>{locNote}</p>}
              {results.length > 0 ? (
                <div className={styles.courseResults} ref={courseBoxRef}>
                  {results.map((c) => {
                    const loc = [c.city, c.state].filter(Boolean).join(", ");
                    return (
                      <button key={c.id} type="button" className={styles.courseHit} onClick={() => pickCourse(c)}>
                        <span className={styles.courseHitMain}>
                          <span className={styles.courseHitName}>{c.name}</span>
                          {c.club_name && c.club_name !== c.name && <span className={styles.courseHitClub}>{c.club_name}</span>}
                          {loc && <span className={styles.courseHitLoc}>{loc}</span>}
                        </span>
                        {c.distance_mi != null && <span className={styles.courseHitDist}>{Math.round(c.distance_mi)} mi</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                searching && hitsQuery === q.trim() && <p className={styles.roundFormHint}>No courses match.</p>
              )}
              <button type="button" className={styles.courseAddBtn} onClick={() => setShowLookup(true)}>
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Can&apos;t find it? Add a course
              </button>
            </>
          )}
          {course && tees.length === 0 && (
            <p className={styles.roundFormHint}>This course has no tees yet — add one from the Courses page first.</p>
          )}

          {showLookup &&
            typeof document !== "undefined" &&
            createPortal(
              <CourseLookupModal
                initialName={q}
                onClose={() => setShowLookup(false)}
                onCourseReady={(c) => {
                  setShowLookup(false);
                  pickCourse({ id: c.id, name: c.name, club_name: c.club_name ?? null, city: c.city, state: c.state });
                }}
                onManualFallback={(prefill) => {
                  setShowLookup(false);
                  const p = new URLSearchParams();
                  if (prefill.name) p.set("name", prefill.name);
                  if (prefill.city) p.set("city", prefill.city);
                  if (prefill.state) p.set("state", prefill.state);
                  onCloseDrawer();
                  router.push(`/new/${slug}/courses/new?${p.toString()}`);
                }}
              />,
              document.body,
            )}
        </div>
      )}

      {/* Step 2 — Date / Holes / Format. */}
      {step === 1 && (
        <>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="round-date">Date</label>
            <input id="round-date" type="date" className={styles.input} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Holes</label>
            <div className={styles.wizSegToggle} role="group" aria-label="Holes">
              {(["18", "9-front", "9-back"] as RoundType[]).map((rt) => (
                <button key={rt} type="button" className={styles.wizSegOption} data-on={roundType === rt || undefined} aria-pressed={roundType === rt} onClick={() => setRoundType(rt)}>
                  {rt === "18" ? "18" : rt === "9-front" ? "Front 9" : "Back 9"}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Format</label>
            <div className={styles.wizSegToggle} role="group" aria-label="Format">
              <button type="button" className={styles.wizSegOption} data-on={format === "individual" || undefined} aria-pressed={format === "individual"} onClick={() => setFormat("individual")}>
                Individual
              </button>
              <button type="button" className={styles.wizSegOption} data-on={format === "scramble" || undefined} aria-pressed={format === "scramble"} onClick={() => setFormat("scramble")}>
                Scramble
              </button>
            </div>
            <p className={styles.roundFormHint} style={{ marginTop: -2 }}>
              {format === "scramble"
                ? "Your whole group plays one ball. You'll enter a single team score per hole, and the round won't affect anyone's handicap."
                : roundType === "18"
                  ? "Everyone plays their own ball. Counts toward your handicap when it's a completed 18."
                  : "Everyone plays their own ball. Nine-hole rounds don't count toward your handicap."}
            </p>
          </div>
        </>
      )}

      {/* Step 3 — Players. */}
      {step === 2 && (
        <div className={styles.field}>
          <label className={styles.label}>Players</label>
          <div className={styles.wizPlayerList}>
            {players.map((p) => (
              <div key={p.key} className={styles.wizPlayerRow}>
                <span className={styles.wizPlayerName}>
                  {p.label}
                  {p.self && <span className={styles.wizPlayerYou}>you</span>}
                  {p.guest_name && <span className={styles.scGuestTag}>guest</span>}
                </span>
                <button type="button" className={styles.wizPlayerRemove} onClick={() => removePlayer(p.key)} aria-label={`Remove ${p.label}`}>
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          {players.length >= MAX_PLAYERS ? (
            <p className={styles.wizPlayerCap}>That&apos;s a full group — up to {MAX_PLAYERS} players.</p>
          ) : (
            <>
              <input className={styles.input} value={playerSearch} onChange={(e) => setPlayerSearch(e.target.value)} placeholder="Add a player…" />
              {playerSearch && availableMembers.length > 0 && (
                <div className={styles.courseResults}>
                  {availableMembers.map((m) => (
                    <button key={m.userId} type="button" className={styles.courseHit} onClick={() => addMember(m)}>
                      <span className={styles.courseHitMain}>
                        <span className={styles.courseHitName}>{m.displayName}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className={styles.wizGuestRow}>
                <input
                  className={styles.input}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Guest name (not in the app)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addGuest();
                    }
                  }}
                />
                <button type="button" className={styles.wizGuestAdd} onClick={addGuest} disabled={!guestName.trim()}>
                  Add
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 4 — Tees (per player). */}
      {step === 3 && (
        <div className={styles.field}>
          <label className={styles.label}>Tees</label>
          {tees.length === 0 ? (
            <p className={styles.roundFormHint}>This course has no tees.</p>
          ) : (
            <>
              <div className={styles.teeQuick}>
                <span className={styles.teeQuickLabel}>All players:</span>
                {tees.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={styles.teeQuickBtn}
                    onClick={() => setTeeByPlayer(Object.fromEntries(players.map((p) => [p.key, t.id])))}
                  >
                    <TeeDot color={t.tee_color} />
                    {t.tee_name}
                    {t.gender === "women" && <span className={styles.teeWMark}>W</span>}
                  </button>
                ))}
              </div>
              {players.map((p) => (
                <div key={p.key} className={styles.wizTeePlayer}>
                  <span className={styles.wizTeePlayerName}>{p.label}</span>
                  <TeeSelect
                    tees={tees}
                    value={teeByPlayer[p.key] || ""}
                    placeholder="Select a tee…"
                    onChange={(id) => setTeeByPlayer((prev) => ({ ...prev, [p.key]: id }))}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Step 5 — Side games (optional). */}
      {step === 4 && (
        <div className={styles.field}>
          <label className={styles.label}>
            Side games <span className={styles.optional}>(optional)</span>
          </label>
          <p className={styles.roundFormHint} style={{ marginTop: -2 }}>
            Add a friendly game and watch live standings while you score. Skip if you just want scores.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <button
              type="button"
              className={styles.createBtnGhost}
              disabled={games.some((g) => g.type === "skins")}
              style={{ opacity: games.some((g) => g.type === "skins") ? 0.5 : 1 }}
              onClick={() => setGames((gs) => [...gs, { key: crypto.randomUUID(), type: "skins", isNet: false, value: null, participantKeys: players.map((p) => p.key) }])}
            >
              + Skins
            </button>
            {(() => {
              // Every distinct pair of players, and which are already matched up.
              const allPairs: [string, string][] = [];
              for (let i = 0; i < players.length; i++)
                for (let j = i + 1; j < players.length; j++) allPairs.push([players[i].key, players[j].key]);
              const taken = new Set(
                games
                  .filter((g) => g.type === "nassau" && g.participantKeys.length === 2)
                  .map((g) => pairKey(g.participantKeys[0], g.participantKeys[1])),
              );
              const nextPair = allPairs.find(([a, b]) => !taken.has(pairKey(a, b)));
              const noPairsLeft = !nextPair;
              return (
                <button
                  type="button"
                  className={styles.createBtnGhost}
                  disabled={noPairsLeft}
                  style={{ opacity: noPairsLeft ? 0.5 : 1 }}
                  onClick={() =>
                    setGames((gs) => [
                      ...gs,
                      { key: crypto.randomUUID(), type: "nassau", isNet: false, value: null, participantKeys: nextPair ? [...nextPair] : [] },
                    ])
                  }
                >
                  + Nassau
                </button>
              );
            })()}
          </div>
          {games.map((g) => (
            <div key={g.key} className={styles.gameCard}>
              <div className={styles.gameCardHead}>
                <span className={styles.gameCardTitle}>
                  {GAME_LABEL[g.type]}
                  {g.type === "nassau" && <span className={styles.optional}> (pick 2)</span>}
                </span>
                <button type="button" className={styles.wizBackLink} onClick={() => setGames((gs) => gs.filter((x) => x.key !== g.key))}>
                  Remove
                </button>
              </div>
              <p className={styles.roundFormHint} style={{ marginTop: -4 }}>{GAME_DESC[g.type]}</p>
              <div className={styles.wizSegToggle} role="group" aria-label="Gross or Net">
                <button type="button" className={styles.wizSegOption} data-on={!g.isNet || undefined} onClick={() => setGames((gs) => gs.map((x) => (x.key === g.key ? { ...x, isNet: false } : x)))}>
                  Gross
                </button>
                <button type="button" className={styles.wizSegOption} data-on={g.isNet || undefined} onClick={() => setGames((gs) => gs.map((x) => (x.key === g.key ? { ...x, isNet: true } : x)))}>
                  Net
                </button>
              </div>
              <span className={styles.gamePlayersHint}>
                {g.type === "nassau" ? "Nassau is 1-on-1, so pick exactly two players" : "Tap players to include or leave out"}
              </span>
              <div className={styles.gamePlayers}>
                {players.map((p) => {
                  const inGame = g.participantKeys.includes(p.key);
                  // Pairs already claimed by OTHER Nassau games — a pair can only play one Nassau.
                  const otherPairs = new Set(
                    games
                      .filter((x) => x.type === "nassau" && x.key !== g.key && x.participantKeys.length === 2)
                      .map((x) => pairKey(x.participantKeys[0], x.participantKeys[1])),
                  );
                  // Nassau is head-to-head: block a third player, or a pick that would
                  // duplicate a pair already matched up in another Nassau.
                  const wouldDupe =
                    g.type === "nassau" &&
                    !inGame &&
                    g.participantKeys.length === 1 &&
                    otherPairs.has(pairKey(g.participantKeys[0], p.key));
                  const locked = g.type === "nassau" && !inGame && (g.participantKeys.length >= 2 || wouldDupe);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      className={styles.gamePlayerChip}
                      data-on={inGame || undefined}
                      disabled={locked}
                      style={locked ? { opacity: 0.3, cursor: "not-allowed" } : undefined}
                      onClick={() =>
                        setGames((gs) =>
                          gs.map((x) =>
                            x.key === g.key
                              ? { ...x, participantKeys: inGame ? x.participantKeys.filter((k) => k !== p.key) : [...x.participantKeys, p.key] }
                              : x,
                          ),
                        )
                      }
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className={styles.gameStake}>
                <span className={styles.gameStakeLabel}>$ per {g.type === "nassau" ? "bet" : "skin"}</span>
                <span className={styles.gameStakeInput}>
                  <span aria-hidden>$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={g.value ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : Math.max(0, Number(e.target.value));
                      setGames((gs) => gs.map((x) => (x.key === g.key ? { ...x, value: v } : x)));
                    }}
                  />
                </span>
                <span className={styles.optional}>optional</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Step 6 — How to score. */}
      {step === 5 && (
        <div className={styles.field}>
          {scoreMode === "choose" ? (
            <>
              <label className={styles.label}>How do you want to score?</label>
              <div className={styles.scoreModes}>
                <button type="button" className={styles.scoreMode} onClick={() => startScoring(true)} disabled={saving}>
                  <span className={styles.scoreModeTitle}>Score hole-by-hole</span>
                  <span className={styles.scoreModeSub}>Enter each hole yourself (putts, penalties, and more). Nothing broadcasts; best for a round already played.</span>
                </button>
                <button type="button" className={styles.scoreMode} onClick={() => startScoring(false)} disabled={saving}>
                  <span className={styles.scoreModeTitle}>Live scoring</span>
                  <span className={styles.scoreModeSub}>Score as you play. Posts a live update to the group and keeps everyone&apos;s phones in sync.</span>
                </button>
                <button type="button" className={styles.scoreMode} onClick={() => setScoreMode("total")} disabled={saving}>
                  <span className={styles.scoreModeTitle}>Enter total score</span>
                  <span className={styles.scoreModeSub}>Just a final gross per player — quickest to log after the round.</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className={styles.wizBackLink} onClick={() => setScoreMode("choose")}>
                ‹ Scoring options
              </button>
              <label className={styles.label}>Total score</label>
              <p className={styles.roundFormHint}>Enter each player&apos;s gross, or leave blank to score later.</p>
              {players.map((p) => (
                <div key={p.key} className={styles.wizScoreRow}>
                  <span className={styles.wizScoreName}>{p.label}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    className={styles.wizScoreInput}
                    value={grossByPlayer[p.key] || ""}
                    onChange={(e) => setGrossByPlayer((prev) => ({ ...prev, [p.key]: e.target.value }))}
                    placeholder="Gross"
                    min={18}
                    max={200}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {error && <p className={styles.formError}>{error}</p>}

      {/* Nav. Step 1 auto-advances when you PICK a course, so it has no nav then;
          but once a course is selected (e.g. after coming Back), show Next so you
          can return to Details without being forced to change the course. On the
          final step, the primary action only appears once "Enter total" is chosen
          (hole-by-hole / live navigate straight to the scorer). */}
      {(step > 0 || course) && (
        <div className={styles.wizNav}>
          {step > 0 && (
            <button type="button" className={styles.wizBackBtn} onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className={styles.createBtn} onClick={() => setStep(step + 1)} disabled={!canAdvance} style={{ opacity: canAdvance ? 1 : 0.6 }}>
              Next
            </button>
          ) : scoreMode === "total" ? (
            <button type="button" className={styles.createBtn} onClick={save} disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save round"}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
