"use client";

// Add-a-course modal that runs the DB → GCAPI → AI cascade and shows
// the user a single confirmation screen with the matched scorecard.
// On confirm, creates the course and hands the new id back to the parent
// (typically RoundForm) so the flow continues without a redirect.

import { useEffect, useMemo, useRef, useState } from "react";
import { formatCourseName } from "@/lib/utils/course-display";

// Loading-state phrases. Cycled through randomly while the cascade runs.
// Mostly golf, with a generous helping of Caddyshack / Happy Gilmore /
// Tin Cup / Bagger Vance — keep these light and never sarcastic about
// the user's choice of course.
const LOADING_PHRASES = [
  "Calling the pro shop…",
  "Asking the starter…",
  "Polishing the wedges…",
  "Reading the break…",
  "Dialing in the yardage…",
  "Lining up the putt…",
  "Be the ball…",
  "It's in the hole!",
  "Cinderella story, outta nowhere…",
  "Just tap it in…",
  "Replacing the divot…",
  "Counting strokes…",
  "Searching the rough…",
  "Marking the scorecard…",
  "Yelling fore…",
  "Looking for a Mulligan…",
  "Flipping through the rulebook…",
  "Checking the back tees…",
  "See the field…",
  "Gripping it and ripping it…",
];

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

interface DraftTee {
  tee_name: string;
  tee_color: string | null;
  gender: "men" | "women" | "all";
  course_rating: number | null;
  slope_rating: number | null;
  total_yards: number | null;
  par: number;
  holes: { hole_number: number; par: number; handicap_index: number; yards: number | null }[];
}

interface Draft {
  lookup_key: string;
  confidence: "high" | "medium" | "low";
  source: "gcapi" | "ai";
  course: {
    name: string;
    club_name: string | null;
    city: string | null;
    state: string | null;
    address: string | null;
    website: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  hole_count: 9 | 18;
  tees: DraftTee[];
  source_urls: string[];
  notes: string | null;
  external_id: string | null;
}

interface CommittedCourse {
  id: string;
  name: string;
  club_name?: string | null;
  city: string | null;
  state: string | null;
  hole_count?: number;
}

interface LookupResponse {
  step: "cache" | "gcapi" | "gcapi_multi" | "ai" | "manual" | "ai_rate_limited" | "all_imported";
  committed: boolean;
  course?: CommittedCourse;
  courses?: CommittedCourse[];
  draft?: Draft;
  drafts?: Draft[];
  alreadyImported?: CommittedCourse[];
  generationId?: string | null;
  cityMismatch?: boolean;
  warnings?: string[];
  reason?: string;
  prefill?: { name: string; city: string; state: string };
  error?: string;
}

interface Props {
  initialName?: string;
  onClose: () => void;
  onCourseReady: (course: CommittedCourse) => void;
  onManualFallback: (prefill: { name: string; city?: string; state: string }) => void;
}

export default function CourseLookupModal({ initialName = "", onClose, onCourseReady, onManualFallback }: Props) {
  const [name, setName] = useState(initialName);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [phase, setPhase] = useState<"input" | "loading" | "select" | "confirm" | "pick" | "error">("input");
  const [candidates, setCandidates] = useState<Draft[]>([]);
  const [statusMsg, setStatusMsg] = useState("");
  const [response, setResponse] = useState<LookupResponse | null>(null);
  const [committing, setCommitting] = useState(false);
  // Courses shown on the pick phase — either bulk-imported just now, or
  // returned by the server when the search hit only already-imported rows.
  const [pickList, setPickList] = useState<CommittedCourse[]>([]);
  const [pickHeading, setPickHeading] = useState<string>("Which one are you playing?");

  // Cycle through silly phrases every 1.6s while loading — picked random
  // sequence on entry so each lookup feels different.
  const [loadingPhrase, setLoadingPhrase] = useState(LOADING_PHRASES[0]);
  useEffect(() => {
    if (phase !== "loading") return;
    const shuffled = [...LOADING_PHRASES].sort(() => Math.random() - 0.5);
    let i = 0;
    setLoadingPhrase(shuffled[i]);
    const t = setInterval(() => {
      i = (i + 1) % shuffled.length;
      setLoadingPhrase(shuffled[i]);
    }, 1600);
    return () => clearInterval(t);
  }, [phase]);

  // Focus city when the modal opens — the user just typed the course name
  // in the search box so name is pre-filled, and city is the next thing
  // they need to provide.
  const cityRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (phase === "input") cityRef.current?.focus();
  }, [phase]);

  async function runLookup() {
    if (!name.trim() || !state) return;
    setPhase("loading");

    let res: Response;
    try {
      res = await fetch("/api/courses/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), city: city.trim() || undefined, state }),
      });
    } catch {
      setStatusMsg("Network error. Please try again.");
      setPhase("error");
      return;
    }

    const data: LookupResponse = await res.json().catch(() => ({} as LookupResponse));

    if (res.ok && data.committed && data.course) {
      onCourseReady(data.course);
      return;
    }
    if (res.ok && data.step === "all_imported" && data.courses && data.courses.length > 0) {
      setPickList(data.courses);
      setPickHeading(
        data.courses.length === 1
          ? "This course is already in your list."
          : "These courses are already in your list — pick the one you're playing."
      );
      setResponse(data);
      setPhase("pick");
      return;
    }
    if (res.ok && data.drafts && data.drafts.length > 0) {
      setCandidates(data.drafts);
      setResponse(data);
      setPhase("select");
      return;
    }
    if (res.ok && data.draft) {
      setResponse(data);
      setPhase("confirm");
      return;
    }
    if (res.status === 422 && data.prefill) {
      onManualFallback({ name: data.prefill.name, city: data.prefill.city, state: data.prefill.state });
      return;
    }
    if (res.status === 429) {
      setStatusMsg(data.error || "Daily lookup limit reached.");
      setPhase("error");
      return;
    }
    setStatusMsg(data.error || "Couldn't find that course.");
    setPhase("error");
  }

  async function commit(draft: Draft) {
    setCommitting(true);
    const res = await fetch("/api/courses/lookup/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generationId: response?.generationId ?? null, draft }),
    });
    const data = await res.json().catch(() => ({}));
    setCommitting(false);
    if (res.ok && data.course) {
      onCourseReady(data.course);
    } else {
      setStatusMsg(data.error || "Failed to save course.");
      setPhase("error");
    }
  }

  async function importAll() {
    if (candidates.length === 0) return;
    setCommitting(true);
    setPhase("loading");
    const res = await fetch("/api/courses/lookup/commit-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationId: response?.generationId ?? null,
        drafts: candidates,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setCommitting(false);
    if (!res.ok || !Array.isArray(data.courses) || data.courses.length === 0) {
      setStatusMsg(data.error || "Failed to import courses.");
      setPhase("error");
      return;
    }
    // Merge any rows the server flagged as already-imported on the original
    // search so the user can also pick those without leaving the modal.
    const merged = [
      ...(data.courses as CommittedCourse[]),
      ...((response?.alreadyImported as CommittedCourse[] | undefined) || []),
    ];
    setPickList(merged);
    setPickHeading(
      merged.length === 1
        ? "Imported. Continue with this course?"
        : "Imported. Which one are you playing?"
    );
    setPhase("pick");
  }

  function reject() {
    onManualFallback({
      name: response?.draft?.course.name || name,
      city: response?.draft?.course.city || city,
      state: response?.draft?.course.state || state,
    });
  }

  return (
    <div className="fixed top-14 bottom-16 left-0 right-0 z-35 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up max-h-full flex flex-col">
        <div className="px-6 pt-3 pb-3 border-b border-gray-100">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Add a New Course</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
        </div>

        {phase === "input" && (
          <div className="px-6 py-4 space-y-3 overflow-y-auto">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Course Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-[16px]"
                placeholder="The Medallion Club"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">City</label>
                <input
                  ref={cityRef}
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-[16px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">State</label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-[16px] bg-white"
                >
                  <option value="">—</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {phase === "loading" && (
          <div className="px-6 py-10 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-green-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-base font-medium text-gray-800 text-center">{loadingPhrase}</p>
          </div>
        )}

        {phase === "select" && candidates.length > 0 && (
          <div className="px-6 py-4 space-y-2 overflow-y-auto">
            <p className="text-sm text-gray-600 mb-1">
              Found {candidates.length} new course{candidates.length === 1 ? "" : "s"} at this club. Pick one or import all:
            </p>
            {response?.alreadyImported && response.alreadyImported.length > 0 && (
              <p className="text-[11px] text-gray-500 italic">
                {response.alreadyImported.length} other course{response.alreadyImported.length === 1 ? "" : "s"} at this club already in your list.
              </p>
            )}
            {candidates.map((c, i) => {
              const back = [...c.tees].sort((a, b) => (b.course_rating ?? 0) - (a.course_rating ?? 0))[0];
              return (
                <button
                  key={i}
                  onClick={() => { setResponse({ ...response!, draft: c }); setPhase("confirm"); }}
                  className="w-full text-left bg-white border border-gray-200 rounded-xl px-3 py-3 active:bg-gray-50"
                >
                  <div className="text-sm font-semibold text-gray-900">{formatCourseName(c.course)}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {c.tees.length} tee{c.tees.length === 1 ? "" : "s"} · {c.hole_count} holes
                    {back && ` · back: par ${back.par}`}
                    {back?.course_rating != null && ` / ${back.course_rating}`}
                    {back?.slope_rating != null && ` / ${back.slope_rating}`}
                  </div>
                </button>
              );
            })}
            {candidates.length > 1 && (
              <button
                onClick={importAll}
                disabled={committing}
                className="w-full mt-1 py-3 bg-green-600 text-white rounded-xl font-semibold text-[15px] disabled:opacity-50 active:opacity-80"
              >
                Import all {candidates.length}
              </button>
            )}
          </div>
        )}

        {phase === "pick" && pickList.length > 0 && (
          <div className="px-6 py-4 space-y-2 overflow-y-auto">
            <p className="text-sm text-gray-600 mb-1">{pickHeading}</p>
            {pickList.map((c) => (
              <button
                key={c.id}
                onClick={() => onCourseReady(c)}
                className="w-full text-left bg-white border border-gray-200 rounded-xl px-3 py-3 active:bg-gray-50"
              >
                <div className="text-sm font-semibold text-gray-900">{formatCourseName(c)}</div>
                {(c.city || c.state) && (
                  <div className="text-xs text-gray-500 mt-0.5">{[c.city, c.state].filter(Boolean).join(", ")}</div>
                )}
              </button>
            ))}
          </div>
        )}

        {phase === "confirm" && response?.draft && (
          <ConfirmPanel
            draft={response.draft}
            cityMismatch={!!response.cityMismatch}
            warnings={response.warnings}
            onConfirm={() => commit(response.draft!)}
            onReject={reject}
            onBack={candidates.length > 1 ? () => setPhase("select") : undefined}
            committing={committing}
          />
        )}

        {phase === "error" && (
          <div className="px-6 py-4 space-y-3">
            <p className="text-sm text-gray-700">{statusMsg}</p>
          </div>
        )}

        {(phase === "input" || phase === "error") && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
            {phase === "input" ? (
              <>
                <button
                  onClick={runLookup}
                  disabled={!name.trim() || !state}
                  className="flex-1 py-3 bg-green-600 text-white rounded-xl font-semibold text-[15px] disabled:opacity-50 active:opacity-80"
                >
                  Look it up
                </button>
                <button
                  onClick={() => onManualFallback({ name, city, state })}
                  className="flex-1 py-3 border border-gray-300 rounded-xl font-semibold text-[15px] text-gray-600 active:bg-gray-50"
                >
                  Enter manually
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onManualFallback({ name, city, state })}
                  className="flex-1 py-3 bg-green-600 text-white rounded-xl font-semibold text-[15px] active:opacity-80"
                >
                  Enter manually
                </button>
                <button
                  onClick={() => setPhase("input")}
                  className="flex-1 py-3 border border-gray-300 rounded-xl font-semibold text-[15px] text-gray-600 active:bg-gray-50"
                >
                  Try again
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ConfirmPanel({
  draft, cityMismatch, warnings, onConfirm, onReject, onBack, committing,
}: {
  draft: Draft;
  cityMismatch: boolean;
  warnings?: string[];
  onConfirm: () => void;
  onReject: () => void;
  onBack?: () => void;
  committing: boolean;
}) {
  // Split tees by gender so a player choosing "Orange" can't accidentally
  // pick the women's Orange when they wanted the men's. "all"-gender tees
  // (the standard unisex case) appear in both tabs.
  const mensTees = useMemo(
    () => draft.tees
      .filter(t => t.gender === "men" || t.gender === "all")
      .sort((a, b) => (b.course_rating ?? 0) - (a.course_rating ?? 0)),
    [draft.tees]
  );
  const womensTees = useMemo(
    () => draft.tees
      .filter(t => t.gender === "women" || t.gender === "all")
      .sort((a, b) => (b.course_rating ?? 0) - (a.course_rating ?? 0)),
    [draft.tees]
  );
  const hasWomens = draft.tees.some(t => t.gender === "women");
  const [tab, setTab] = useState<"mens" | "womens">("mens");
  const visibleTees = tab === "mens" ? mensTees : womensTees;

  return (
    <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
      {(draft.confidence !== "high" || cityMismatch) && (
        <div className={`text-xs px-3 py-2 rounded-lg ${cityMismatch ? "bg-amber-50 text-amber-800" : "bg-yellow-50 text-yellow-800"}`}>
          {cityMismatch
            ? `We found this in ${draft.course.city || "?"}, ${draft.course.state}. Is that the right one?`
            : `Confidence: ${draft.confidence}. Double-check ratings and slope before confirming.`}
        </div>
      )}

      <div>
        <h3 className="text-base font-semibold text-gray-900">{formatCourseName(draft.course)}</h3>
        <p className="text-xs text-gray-500">
          {[draft.course.city, draft.course.state].filter(Boolean).join(", ")}
        </p>
      </div>

      {hasWomens && (
        <div className="flex gap-1 border-b border-gray-200">
          <button
            onClick={() => setTab("mens")}
            className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px ${
              tab === "mens" ? "border-green-600 text-green-700" : "border-transparent text-gray-500"
            }`}
          >
            Men&apos;s ({mensTees.length})
          </button>
          <button
            onClick={() => setTab("womens")}
            className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px ${
              tab === "womens" ? "border-green-600 text-green-700" : "border-transparent text-gray-500"
            }`}
          >
            Women&apos;s ({womensTees.length})
          </button>
        </div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wide text-gray-600 grid grid-cols-12 gap-2">
          <div className="col-span-4">Tee</div>
          <div className="col-span-2 text-right">Par</div>
          <div className="col-span-2 text-right">Yards</div>
          <div className="col-span-2 text-right">Rating</div>
          <div className="col-span-2 text-right">Slope</div>
        </div>
        {visibleTees.map((tee, i) => (
          <div key={i} className="px-3 py-2 border-b last:border-b-0 border-gray-100 grid grid-cols-12 gap-2 text-sm">
            <div className="col-span-4 flex items-center gap-1.5">
              {tee.tee_color && (
                <span className="inline-block w-2.5 h-2.5 rounded-full border border-gray-300" style={{ backgroundColor: tee.tee_color }} />
              )}
              <span className="font-medium text-gray-900">{tee.tee_name}</span>
            </div>
            <div className="col-span-2 text-right tabular-nums">{tee.par}</div>
            <div className="col-span-2 text-right tabular-nums text-gray-600">{tee.total_yards ?? "—"}</div>
            <div className="col-span-2 text-right tabular-nums text-gray-600">{tee.course_rating ?? "—"}</div>
            <div className="col-span-2 text-right tabular-nums text-gray-600">{tee.slope_rating ?? "—"}</div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-gray-500">
        {draft.tees.length} tee{draft.tees.length === 1 ? "" : "s"} · {draft.hole_count} holes ·
        marked as <span className="font-semibold">community-submitted</span> until an admin verifies.
      </p>

      {warnings && warnings.length > 0 && (
        <details className="text-[11px] text-gray-500">
          <summary className="cursor-pointer">{warnings.length} warning{warnings.length === 1 ? "" : "s"}</summary>
          <ul className="mt-1 space-y-0.5 pl-3 list-disc">
            {warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </details>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onConfirm}
          disabled={committing}
          className="flex-1 py-3 bg-green-600 text-white rounded-xl font-semibold text-[15px] disabled:opacity-50 active:opacity-80"
        >
          {committing ? "Saving…" : "Looks right"}
        </button>
        {onBack && (
          <button
            onClick={onBack}
            disabled={committing}
            className="py-3 px-4 border border-gray-300 rounded-xl font-semibold text-[15px] text-gray-600 active:bg-gray-50"
          >
            Back
          </button>
        )}
        <button
          onClick={onReject}
          disabled={committing}
          className="py-3 px-4 border border-gray-300 rounded-xl font-semibold text-[15px] text-gray-600 active:bg-gray-50"
        >
          Manual
        </button>
      </div>
    </div>
  );
}
