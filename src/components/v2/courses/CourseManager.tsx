"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import { TEE_COLOR_OPTIONS, getTeeColorClasses } from "@/lib/v2/tee-colors";

const HoleMapEditor = dynamic(() => import("@/components/v2/courses/HoleMapEditor"), { ssr: false });

/* ── Types (subset of the /api/v2/courses/[id] payload we edit) ───────────── */
interface Course {
  id: string; name: string; club_name: string | null; city: string | null; state: string | null;
  address: string | null; phone: string | null; website: string | null; hole_count: 9 | 18;
  latitude: number | null; longitude: number | null;
}
interface Tee {
  id: string; tee_name: string; tee_color: string | null; gender: string;
  course_rating: number | null; slope_rating: number | null; total_yards: number | null; par: number;
}
interface Hole {
  id: string; tee_id: string; hole_number: number; par: number; handicap_index: number;
  yards: number | null; hole_name: string | null;
  tee_latitude: number | null; tee_longitude: number | null;
  green_latitude: number | null; green_longitude: number | null;
  green_front_latitude: number | null; green_front_longitude: number | null;
  green_back_latitude: number | null; green_back_longitude: number | null;
  drive_latitude: number | null; drive_longitude: number | null;
  center_line: [number, number][] | null;
}
type Tab = "info" | "tees" | "holes" | "map" | "scorecard";

const TABS: { key: Tab; label: string }[] = [
  { key: "info", label: "Info" },
  { key: "tees", label: "Tees" },
  { key: "holes", label: "Holes" },
  { key: "map", label: "Map" },
  { key: "scorecard", label: "Scorecard" },
];

const GPS_KEYS: (keyof Hole)[] = [
  "tee_latitude", "green_latitude", "green_front_latitude", "green_back_latitude", "drive_latitude",
];
function mappedCount(h: Hole): number {
  return GPS_KEYS.filter((k) => h[k] != null).length;
}

interface CompMap { hole_number: number; source_tee_id: string }

export default function CourseManager({ courseId, slug, viewerIsAdmin = false, onCourseChanged }: {
  courseId: string; slug?: string; viewerIsAdmin?: boolean; onCourseChanged?: () => void;
}) {
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [tees, setTees] = useState<Tee[]>([]);
  const [holesByTee, setHolesByTee] = useState<Record<string, Hole[]>>({});
  const [compIds, setCompIds] = useState<string[]>([]);
  const [compMappings, setCompMappings] = useState<Record<string, CompMap[]>>({});
  const [selectedTeeId, setSelectedTeeId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("info");
  const [status, setStatus] = useState<string | null>(null);
  const [mapHole, setMapHole] = useState<Hole | null>(null);
  const [confirmDelTee, setConfirmDelTee] = useState<Tee | null>(null);
  const [confirmDelCourse, setConfirmDelCourse] = useState(false);

  interface Detail {
    course: Course; tees: Tee[];
    holes_by_tee: Record<string, Hole[]>;
    composition_tee_ids: string[];
    composition_mappings: Record<string, CompMap[]>;
    selected_tee_id: string | null;
  }
  const fetchDetail = useCallback(async (): Promise<Detail | null> => {
    const res = await fetch(`/api/v2/courses/${courseId}`);
    return res.ok ? ((await res.json()) as Detail) : null;
  }, [courseId]);

  // Refetch after an edit (setState in a handler is fine; not an effect).
  const reload = useCallback(async (keep?: string | null) => {
    const d = await fetchDetail();
    if (!d) return;
    setCourse(d.course); setTees(d.tees || []);
    setHolesByTee(d.holes_by_tee || {});
    setCompIds(d.composition_tee_ids || []);
    setCompMappings(d.composition_mappings || {});
    // Preserve the current tee across reloads; fall back to the server default.
    setSelectedTeeId((cur) => keep ?? cur ?? d.selected_tee_id ?? null);
  }, [fetchDetail]);

  useEffect(() => {
    let active = true;
    (async () => {
      const d = await fetchDetail();
      if (!active || !d) return;
      setCourse(d.course); setTees(d.tees || []);
      setHolesByTee(d.holes_by_tee || {});
      setCompIds(d.composition_tee_ids || []);
      setCompMappings(d.composition_mappings || {});
      setSelectedTeeId(d.selected_tee_id || null);
    })();
    return () => { active = false; };
  }, [fetchDetail]);

  function flash(msg: string) {
    setStatus(msg);
    setTimeout(() => setStatus(null), 2000);
  }

  if (!course) return <div className="py-12 text-center text-sm text-gray-500">Loading course…</div>;

  // Derived from the preloaded data — switching tees is instant (no refetch).
  const holes = (selectedTeeId && holesByTee[selectedTeeId]) || [];
  const isComposition = !!selectedTeeId && compIds.includes(selectedTeeId);

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${
              tab === t.key ? "border-green-600 text-green-700" : "border-transparent text-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {status && <div className="mb-3 text-xs font-medium text-green-700">{status}</div>}

      {tab === "info" && (
        <InfoTab
          course={course}
          canDelete={viewerIsAdmin}
          onDeleteCourse={() => setConfirmDelCourse(true)}
          onSaved={(c) => { setCourse(c); flash("Saved"); onCourseChanged?.(); }}
        />
      )}
      {tab === "tees" && (
        <TeesTab
          tees={tees}
          compIds={compIds}
          compMappings={compMappings}
          onReload={() => reload(selectedTeeId)}
          onDelete={(t) => setConfirmDelTee(t)}
          courseId={courseId}
          flash={flash}
        />
      )}
      {tab === "holes" && (
        <HolesTab
          tees={tees}
          holes={holes}
          selectedTeeId={selectedTeeId}
          onSelectTee={setSelectedTeeId}
          onReload={() => reload(selectedTeeId)}
          readOnly={isComposition}
          flash={flash}
        />
      )}
      {tab === "map" && (
        <MapTab
          tees={tees}
          holes={holes}
          selectedTeeId={selectedTeeId}
          onSelectTee={setSelectedTeeId}
          onOpenHole={setMapHole}
          readOnly={isComposition}
        />
      )}
      {tab === "scorecard" && (
        <ScorecardTab tees={tees} holes={holes} selectedTeeId={selectedTeeId} onSelectTee={setSelectedTeeId} />
      )}

      {mapHole && course && (
        <HoleMapEditor
            key={mapHole.id}
            holeNumber={mapHole.hole_number}
            courseId={courseId}
            courseLatitude={course.latitude}
            courseLongitude={course.longitude}
            courseAddress={course.address}
            courseName={course.name}
            courseCity={course.city}
            courseState={course.state}
            teeName={tees.find((t) => t.id === selectedTeeId)?.tee_name}
            teeColor={tees.find((t) => t.id === selectedTeeId)?.tee_color}
            previousHoleGreen={(() => {
              const prev = holes.find((h) => h.hole_number === mapHole.hole_number - 1);
              return prev && prev.green_latitude != null && prev.green_longitude != null
                ? [prev.green_latitude, prev.green_longitude] as [number, number]
                : null;
            })()}
            coordinates={{
              tee_latitude: mapHole.tee_latitude, tee_longitude: mapHole.tee_longitude,
              green_latitude: mapHole.green_latitude, green_longitude: mapHole.green_longitude,
              green_front_latitude: mapHole.green_front_latitude, green_front_longitude: mapHole.green_front_longitude,
              green_back_latitude: mapHole.green_back_latitude, green_back_longitude: mapHole.green_back_longitude,
              drive_latitude: mapHole.drive_latitude, drive_longitude: mapHole.drive_longitude,
              center_line: mapHole.center_line,
            }}
            onSave={async (coords) => {
              const res = await fetch(`/api/v2/courses/holes/coordinates`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hole_id: mapHole.id, ...coords }),
              });
              if (res.ok) { setMapHole(null); await reload(selectedTeeId); flash("Map saved"); onCourseChanged?.(); }
            }}
            onSaveNext={
              holes.some((h) => h.hole_number === mapHole.hole_number + 1)
                ? async (coords) => {
                    const res = await fetch(`/api/v2/courses/holes/coordinates`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ hole_id: mapHole.id, ...coords }),
                    });
                    if (res.ok) {
                      const next = holes.find((h) => h.hole_number === mapHole.hole_number + 1) || null;
                      setMapHole(next);
                      await reload(selectedTeeId);
                      flash("Saved");
                      onCourseChanged?.();
                    }
                  }
                : undefined
            }
            onClose={() => setMapHole(null)}
          />
      )}

      <ConfirmModal
        open={!!confirmDelTee}
        title="Delete tee box?"
        message={confirmDelTee ? `Delete the "${confirmDelTee.tee_name}" tee and its holes?` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const t = confirmDelTee;
          setConfirmDelTee(null);
          if (!t) return;
          const res = await fetch(`/api/v2/courses/tees?tee_id=${t.id}&course_id=${courseId}`, { method: "DELETE" });
          if (res.ok) { await reload(selectedTeeId); flash("Tee deleted"); } else { flash((await res.json().catch(() => ({}))).error || "Could not delete"); }
        }}
        onCancel={() => setConfirmDelTee(null)}
      />

      <ConfirmModal
        open={confirmDelCourse}
        title="Delete this course?"
        message="This permanently removes the course and all its tees, holes, and hybrid tees. Courses are shared by every group. This can't be undone."
        confirmLabel="Delete course"
        destructive
        onConfirm={async () => {
          setConfirmDelCourse(false);
          const res = await fetch(`/api/v2/courses/${courseId}`, { method: "DELETE" });
          if (res.ok) { if (slug) router.push(`/new/${slug}/courses`); else onCourseChanged?.(); }
          else { flash((await res.json().catch(() => ({}))).error || "Could not delete"); }
        }}
        onCancel={() => setConfirmDelCourse(false)}
      />
    </div>
  );
}

/* ── Info ─────────────────────────────────────────────────────────────────── */
function InfoTab({ course, canDelete, onDeleteCourse, onSaved }: {
  course: Course; canDelete: boolean; onDeleteCourse: () => void; onSaved: (c: Course) => void;
}) {
  const [f, setF] = useState(course);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Course, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const input = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent";

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/v2/courses/${course.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: f.name, club_name: f.club_name, city: f.city, state: f.state,
        address: f.address, phone: f.phone, website: f.website, hole_count: f.hole_count,
      }),
    });
    setSaving(false);
    if (res.ok) onSaved(f);
  }

  return (
    <div className="space-y-3">
      <Field label="Course name"><input className={input} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label="Club name"><input className={input} value={f.club_name || ""} onChange={(e) => set("club_name", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City"><input className={input} value={f.city || ""} onChange={(e) => set("city", e.target.value)} /></Field>
        <Field label="State"><input className={input} value={f.state || ""} onChange={(e) => set("state", e.target.value)} placeholder="OH" /></Field>
      </div>
      <Field label="Address"><input className={input} value={f.address || ""} onChange={(e) => set("address", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone"><input className={input} value={f.phone || ""} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Website"><input className={input} value={f.website || ""} onChange={(e) => set("website", e.target.value)} /></Field>
      </div>
      <button type="button" onClick={save} disabled={saving} className="w-full py-3 bg-green-600 text-white font-semibold rounded-lg disabled:opacity-50">
        {saving ? "Saving…" : "Save course info"}
      </button>

      {canDelete && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <button type="button" onClick={onDeleteCourse} className="text-sm font-medium text-red-600 active:opacity-70">
            Delete this course
          </button>
          <p className="mt-1 text-xs text-gray-400">Admins only. Removes the course for every group (e.g. a duplicate).</p>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

const GENDER_OPTIONS: { value: "all" | "men" | "women"; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "men", label: "Men's" },
  { value: "women", label: "Women's" },
];

/** Segmented control for a tee's gender (men's / women's / unisex). */
function GenderPicker({ value, onChange }: { value: "all" | "men" | "women"; onChange: (g: "all" | "men" | "women") => void }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
      {GENDER_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-xs font-medium ${value === o.value ? "bg-green-600 text-white" : "bg-white text-gray-600"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Tees ─────────────────────────────────────────────────────────────────── */
function TeesTab({ tees, compIds, compMappings, onReload, onDelete, courseId, flash }: {
  tees: Tee[]; compIds: string[]; compMappings: Record<string, CompMap[]>;
  onReload: () => void; onDelete: (t: Tee) => void; courseId: string; flash: (m: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGender, setNewGender] = useState<"all" | "men" | "women">("all");

  async function addTee() {
    if (!newName.trim()) return;
    const res = await fetch(`/api/v2/courses/tees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_id: courseId, tee_name: newName.trim(), gender: newGender }),
    });
    if (res.ok) { setNewName(""); setNewGender("all"); setAdding(false); onReload(); flash("Tee added"); }
  }
  async function saveTee(t: Tee) {
    const res = await fetch(`/api/v2/courses/tees`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tee_id: t.id, tee_name: t.tee_name, tee_color: t.tee_color, gender: t.gender, course_rating: t.course_rating, slope_rating: t.slope_rating, par: t.par }),
    });
    // Reload so the accordion summary (which reads saved props) reflects the edit.
    if (res.ok) { flash("Tee saved"); onReload(); } else { flash((await res.json().catch(() => ({}))).error || "Could not save tee"); }
  }

  return (
    <div className="space-y-3">
      {tees.map((t) => (
        <TeeRow
          key={t.id}
          tee={t}
          isComp={compIds.includes(t.id)}
          eligible={tees.filter((x) => x.id !== t.id && !compIds.includes(x.id))}
          mappingArr={compMappings[t.id] || []}
          onSave={saveTee}
          onDelete={onDelete}
          onChanged={onReload}
          canDelete={tees.length > 1}
        />
      ))}

      {adding ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tee name (e.g. Blue)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg" />
            <button type="button" onClick={addTee} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium">Add</button>
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-2 text-gray-500 text-sm">Cancel</button>
          </div>
          <GenderPicker value={newGender} onChange={setNewGender} />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="text-sm font-semibold text-green-700">+ Add tee box</button>
      )}
    </div>
  );
}

function TeeRow({ tee, isComp, eligible, mappingArr, onSave, onDelete, onChanged, canDelete }: {
  tee: Tee; isComp: boolean; eligible: Tee[]; mappingArr: CompMap[];
  onSave: (t: Tee) => void; onDelete: (t: Tee) => void; onChanged: () => void; canDelete: boolean;
}) {
  const [t, setT] = useState(tee);
  // Reset local edits when the tee prop identity changes (after a reload).
  const [seen, setSeen] = useState(tee);
  if (seen !== tee) { setSeen(tee); setT(tee); }
  const input = "w-full px-2 py-1.5 border border-gray-300 rounded text-sm";
  // Summary reflects saved values (props); the body edits local state.
  const sumCls = getTeeColorClasses(tee.tee_color);
  const dotStyle = (c: ReturnType<typeof getTeeColorClasses>) =>
    c.isGradient ? { background: c.gradientHex! } : c.hex ? { background: c.hex } : undefined;

  return (
    <details className="group border border-gray-200 rounded-xl bg-white">
      <summary className="flex items-center gap-2 p-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className={`w-4 h-4 shrink-0 rounded-full ${sumCls.bg}`} style={dotStyle(sumCls)} />
        <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-900">
          {tee.tee_name}
          {tee.gender === "women" && <span className="ml-1.5 text-[0.6rem] uppercase tracking-wide text-pink-600">Women&apos;s</span>}
          {tee.gender === "men" && <span className="ml-1.5 text-[0.6rem] uppercase tracking-wide text-gray-400">Men&apos;s</span>}
          {isComp && <span className="ml-1.5 text-[0.6rem] uppercase tracking-wide text-gray-400">Hybrid</span>}
        </span>
        <span className="text-xs text-gray-500 whitespace-nowrap">Par {tee.par}</span>
        <span className="text-xs text-gray-400 whitespace-nowrap">{tee.course_rating ?? "—"} / {tee.slope_rating ?? "—"}</span>
        <svg className="w-4 h-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>

      <div className="border-t border-gray-100 px-3 pb-3 pt-3">
        <div className="mb-2">
          <label className="block text-[0.65rem] text-gray-500">Tee name</label>
          <input value={t.tee_name} onChange={(e) => setT({ ...t, tee_name: e.target.value })} className={input} />
        </div>
        <div className="mb-2">
          <label className="block text-[0.65rem] text-gray-500 mb-1">Color</label>
          <div className="flex flex-wrap gap-1.5">
            {TEE_COLOR_OPTIONS.map((c) => (
              <button key={c.value} type="button" title={c.label} onClick={() => setT({ ...t, tee_color: c.value })}
                className={`w-6 h-6 rounded-full ${c.bg} ${t.tee_color === c.value ? "ring-2 ring-green-500 ring-offset-1" : ""}`} />
            ))}
          </div>
        </div>
        <div className="mb-2">
          <label className="block text-[0.65rem] text-gray-500 mb-1">Tees for</label>
          <GenderPicker value={(t.gender as "all" | "men" | "women") ?? "all"} onChange={(g) => setT({ ...t, gender: g })} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div><label className="block text-[0.65rem] text-gray-500">Par</label><input type="number" className={input} value={t.par} onChange={(e) => setT({ ...t, par: parseInt(e.target.value) || 0 })} /></div>
          <div><label className="block text-[0.65rem] text-gray-500">Rating</label><input type="number" step="0.1" className={input} value={t.course_rating ?? ""} onChange={(e) => setT({ ...t, course_rating: e.target.value ? parseFloat(e.target.value) : null })} /></div>
          <div><label className="block text-[0.65rem] text-gray-500">Slope</label><input type="number" className={input} value={t.slope_rating ?? ""} onChange={(e) => setT({ ...t, slope_rating: e.target.value ? parseInt(e.target.value) : null })} /></div>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <button type="button" onClick={() => onSave(t)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold">Save tee</button>
          {canDelete && <button type="button" onClick={() => onDelete(tee)} className="text-sm font-medium text-red-600">Delete</button>}
        </div>
        <CompositionEditor tee={tee} isComp={isComp} eligible={eligible} mappingArr={mappingArr} onChanged={onChanged} />
      </div>
    </details>
  );
}

/* ── Hybrid (composition) tee editor ─────────────────────────────────────────
 * Fully controlled by props (the parent preloads composition state), so the
 * checkbox + selectors render correctly on first paint — no fetch, no flash.
 * The "Hybrid tee" checkbox is the toggle; when on, the per-hole pickers show. */
function CompositionEditor({ tee, isComp, eligible, mappingArr, onChanged }: {
  tee: Tee; isComp: boolean; eligible: Tee[]; mappingArr: CompMap[]; onChanged: () => void;
}) {
  const toMap = (arr: CompMap[]) => {
    const m: Record<number, string> = {};
    for (const e of arr) m[e.hole_number] = e.source_tee_id;
    return m;
  };
  const [mappings, setMappings] = useState<Record<number, string>>(() => toMap(mappingArr));
  const [seen, setSeen] = useState(mappingArr);
  if (seen !== mappingArr) { setSeen(mappingArr); setMappings(toMap(mappingArr)); }
  const [busy, setBusy] = useState(false);
  const H = { "Content-Type": "application/json" };

  async function saveMappings(m: Record<number, string>) {
    const arr = Object.entries(m).map(([hn, src]) => ({ hole_number: Number(hn), source_tee_id: src }));
    await fetch(`/api/v2/courses/composition-tees`, { method: "POST", headers: H, body: JSON.stringify({ tee_id: tee.id, mappings: arr }) });
    // Auto-name the color as a gradient ("black/blue"), harder tee first.
    const srcs = [...new Set(Object.values(m))]
      .map((id) => eligible.find((x) => x.id === id))
      .filter((x): x is Tee => !!x)
      .sort((a, b) => (b.course_rating ?? 0) - (a.course_rating ?? 0));
    if (srcs.length >= 2) {
      const grad = srcs.map((x) => x.tee_color || x.tee_name).join("/");
      await fetch(`/api/v2/courses/tees`, { method: "PUT", headers: H, body: JSON.stringify({ tee_id: tee.id, tee_color: grad }) });
    }
  }

  async function toggleComposition() {
    setBusy(true);
    if (isComp) {
      await fetch(`/api/v2/courses/composition-tees`, { method: "DELETE", headers: H, body: JSON.stringify({ tee_id: tee.id }) });
    } else {
      const def = eligible[0]?.id;
      if (def) {
        const map: Record<number, string> = {};
        for (let h = 1; h <= 18; h++) map[h] = def;
        setMappings(map);
        await saveMappings(map);
      }
    }
    setBusy(false);
    onChanged();
  }

  async function setHole(hn: number, src: string) {
    const m = { ...mappings, [hn]: src };
    setMappings(m);
    await saveMappings(m);
    onChanged();
  }

  const holeRow = (hn: number) => (
    <div key={hn} className="flex items-center gap-1.5 text-xs">
      <span className="w-7 text-gray-500">#{hn}</span>
      <select value={mappings[hn] || ""} onChange={(e) => setHole(hn, e.target.value)} className="flex-1 min-w-0 px-1.5 py-1 border border-gray-300 rounded text-xs">
        {eligible.map((x) => <option key={x.id} value={x.id}>{x.tee_name}</option>)}
      </select>
    </div>
  );

  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
        <input type="checkbox" checked={isComp} onChange={toggleComposition} disabled={busy || (!isComp && eligible.length === 0)} />
        Hybrid tee{!isComp && eligible.length === 0 ? " (add another standard tee first)" : ""}
      </label>
      {isComp && (
        // Front nine (1–9) down the left column, back nine (10–18) down the right.
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2">
          <div className="space-y-1.5">{Array.from({ length: 9 }, (_, i) => i + 1).map(holeRow)}</div>
          <div className="space-y-1.5">{Array.from({ length: 9 }, (_, i) => i + 10).map(holeRow)}</div>
        </div>
      )}
    </div>
  );
}

/* ── Holes ────────────────────────────────────────────────────────────────── */
function HolesTab({ tees, holes, selectedTeeId, onSelectTee, onReload, readOnly, flash }: {
  tees: Tee[]; holes: Hole[]; selectedTeeId: string | null; onSelectTee: (id: string) => void; onReload: () => void; readOnly: boolean; flash: (m: string) => void;
}) {
  const [rows, setRows] = useState<Hole[]>(holes);
  const [saving, setSaving] = useState(false);
  // Reset local edits when the holes prop identity changes (tee switch / reload).
  const [seen, setSeen] = useState(holes);
  if (seen !== holes) { setSeen(holes); setRows(holes); }
  const setRow = (id: string, k: keyof Hole, v: unknown) => setRows((p) => p.map((h) => (h.id === id ? { ...h, [k]: v } : h)));

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/v2/courses/holes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holes: rows.map((h) => ({ id: h.id, par: h.par, handicap_index: h.handicap_index, yards: h.yards, hole_name: h.hole_name })) }),
    });
    setSaving(false);
    if (res.ok) { flash("Holes saved"); onReload(); } else { flash((await res.json().catch(() => ({}))).error || "Could not save"); }
  }

  const cell = "w-full px-1.5 py-1 border border-gray-300 rounded text-sm text-center disabled:bg-gray-50 disabled:text-gray-600 disabled:border-gray-200";
  const nameCell = "w-full px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-50 disabled:text-gray-600 disabled:border-gray-200";
  const teeById = new Map(tees.map((t) => [t.id, t]));
  const front = rows.filter((h) => h.hole_number <= 9);
  const back = rows.filter((h) => h.hole_number > 9);
  const sum = (list: Hole[], k: "par" | "yards") => list.reduce((a, h) => a + (h[k] || 0), 0);

  // Standard & hybrid tees share one layout. Both render the color-dot column;
  // for a standard tee the circle is transparent (a placeholder holding the exact
  // same space), for a hybrid it's the source tee's color. Nothing else differs.
  const dataRow = (h: Hole) => {
    const src = readOnly ? teeById.get(h.tee_id) : undefined;
    const cls = src ? getTeeColorClasses(src.tee_color) : null;
    return (
      <tr key={h.id} className="border-b border-gray-100">
        <td className="w-6 py-1 font-medium text-gray-700">{h.hole_number}</td>
        <td className="w-5 py-1 text-center">
          <span title={readOnly ? src?.tee_name ?? undefined : undefined}
            className={`inline-block w-3 h-3 rounded-full align-middle ${readOnly ? (cls?.bg ?? "bg-gray-200") : "bg-transparent"}`}
            style={readOnly && cls?.isGradient ? { background: cls.gradientHex! } : readOnly && cls?.hex ? { background: cls.hex } : undefined} />
        </td>
        <td className="py-1 px-0.5 w-14"><input type="number" tabIndex={100 + h.hole_number} disabled={readOnly} className={cell} value={h.par} onChange={(e) => setRow(h.id, "par", parseInt(e.target.value) || 0)} /></td>
        <td className="py-1 px-0.5 w-14"><input type="number" tabIndex={200 + h.hole_number} disabled={readOnly} className={cell} value={h.handicap_index} onChange={(e) => setRow(h.id, "handicap_index", parseInt(e.target.value) || 0)} /></td>
        <td className="py-1 px-0.5 w-16"><input type="number" tabIndex={300 + h.hole_number} disabled={readOnly} className={cell} value={h.yards ?? ""} onChange={(e) => setRow(h.id, "yards", e.target.value ? parseInt(e.target.value) : null)} /></td>
        <td className="py-1 pl-2"><input tabIndex={400 + h.hole_number} disabled={readOnly} className={nameCell} value={h.hole_name ?? ""} onChange={(e) => setRow(h.id, "hole_name", e.target.value)} placeholder="—" /></td>
      </tr>
    );
  };

  const subtotal = (label: string, list: Hole[]) => (
    <tr className="bg-green-100 font-semibold text-gray-800">
      <td className="py-1.5 pr-1" colSpan={2}>{label}</td>
      <td className="py-1.5 text-center">{sum(list, "par")}</td>
      <td />
      <td className="py-1.5 text-center">{sum(list, "yards") || "—"}</td>
      <td />
    </tr>
  );

  return (
    <div>
      <TeePicker tees={tees} selectedTeeId={selectedTeeId} onSelect={onSelectTee} />
      <div className="overflow-x-auto">
        {/* border-collapse so the colored total rows read as one continuous band */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-[0.65rem] text-gray-500 uppercase">
              <th className="text-left py-1 w-6">#</th>
              <th className="py-1 w-5" aria-label="Tee" />
              <th className="py-1">Par</th><th className="py-1">Hcp</th><th className="py-1">Yards</th><th className="text-left py-1 pl-2">Name</th>
            </tr>
          </thead>
          <tbody>
            {front.map(dataRow)}
            {subtotal("Out", front)}
            {back.length > 0 && back.map(dataRow)}
            {back.length > 0 && subtotal("In", back)}
            {back.length > 0 && subtotal("Total", rows)}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <button type="button" onClick={save} disabled={saving} className="mt-3 w-full py-3 bg-green-600 text-white font-semibold rounded-lg disabled:opacity-50">
          {saving ? "Saving…" : "Save holes"}
        </button>
      )}
      {readOnly && (
        <p className="mt-4 text-[0.7rem] text-gray-400">
          Hybrid tee — each hole is played from the source tee marked by the dot. Edit the source tees to change par, handicap, or yards.
        </p>
      )}
    </div>
  );
}

/* ── Map ──────────────────────────────────────────────────────────────────── */
function MapTab({ tees, holes, selectedTeeId, onSelectTee, onOpenHole, readOnly }: {
  tees: Tee[]; holes: Hole[]; selectedTeeId: string | null; onSelectTee: (id: string) => void; onOpenHole: (h: Hole) => void; readOnly: boolean;
}) {
  return (
    <div>
      <TeePicker tees={tees} selectedTeeId={selectedTeeId} onSelect={onSelectTee} />
      {readOnly && (
        <p className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Hybrid tee — GPS mapping is inherited from its source tees. Map the source tees to change it.
        </p>
      )}
      <div className="space-y-1.5">
        {holes.map((h) => {
          const n = mappedCount(h);
          const label = (
            <>
              <span className="font-medium text-gray-800">Hole {h.hole_number}{h.hole_name ? ` — ${h.hole_name}` : ""}</span>
              <span className={`text-xs font-medium ${n === 5 ? "text-green-700" : n === 0 ? "text-gray-400" : "text-amber-600"}`}>
                {n === 5 ? "Mapped" : `${n}/5`}
              </span>
            </>
          );
          return readOnly ? (
            <div key={h.id} className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50">{label}</div>
          ) : (
            <button key={h.id} type="button" onClick={() => onOpenHole(h)}
              className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-xl bg-white active:bg-gray-50">{label}</button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Scorecard (read-only) ────────────────────────────────────────────────── */
function sumHoles(hs: Hole[], k: "par" | "yards"): number {
  return hs.reduce((a, h) => a + (h[k] || 0), 0);
}

// A real scorecard reads top-to-bottom: Yardage, Handicap, Par (with hole
// numbers across the top and an Out/In/Tot column).
function ScorecardNine({ label, hs }: { label: string; hs: Hole[] }) {
  if (hs.length === 0) return null;
  return (
    <div className="overflow-x-auto mb-3">
      <table className="w-full text-xs text-center border-collapse table-fixed">
        <thead>
          <tr className="bg-gray-100 text-gray-600 font-semibold">
            <th className="text-left py-1 px-2 w-16">Hole</th>
            {hs.map((h) => <th key={h.id} className="py-1 px-1">{h.hole_number}</th>)}
            <th className="py-1 px-1 w-10">{label}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-gray-100"><td className="text-left py-1 px-2 text-gray-500">Yards</td>{hs.map((h) => <td key={h.id} className="py-1">{h.yards ?? "—"}</td>)}<td className="py-1 font-semibold">{sumHoles(hs, "yards") || "—"}</td></tr>
          <tr className="border-t border-gray-100"><td className="text-left py-1 px-2 text-gray-500">Handicap</td>{hs.map((h) => <td key={h.id} className="py-1 text-gray-400">{h.handicap_index}</td>)}<td /></tr>
          <tr className="border-t border-gray-100"><td className="text-left py-1 px-2 text-gray-500">Par</td>{hs.map((h) => <td key={h.id} className="py-1 font-medium">{h.par}</td>)}<td className="py-1 font-semibold">{sumHoles(hs, "par")}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function ScoreStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 text-center">
      <div className="text-[0.6rem] uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-sm font-semibold text-gray-800 truncate">{value}</div>
    </div>
  );
}

function ScorecardTab({ tees, holes, selectedTeeId, onSelectTee }: {
  tees: Tee[]; holes: Hole[]; selectedTeeId: string | null; onSelectTee: (id: string) => void;
}) {
  const tee = tees.find((t) => t.id === selectedTeeId) || null;
  const front = holes.filter((h) => h.hole_number <= 9);
  const back = holes.filter((h) => h.hole_number > 9);
  const yds = sumHoles(holes, "yards");
  return (
    <div>
      <TeePicker tees={tees} selectedTeeId={selectedTeeId} onSelect={onSelectTee} />
      {tee && (
        // Fixed 5-column grid so stats stay put when switching tees.
        <div className="grid grid-cols-5 gap-2 mb-4 px-1 py-2 border-y border-gray-200">
          <ScoreStat label="Tee" value={`${tee.tee_name}${tee.gender === "women" ? " (W)" : ""}`} />
          <ScoreStat label="Rating" value={tee.course_rating ?? "—"} />
          <ScoreStat label="Slope" value={tee.slope_rating ?? "—"} />
          <ScoreStat label="Par" value={tee.par} />
          <ScoreStat label="Yards" value={yds || "—"} />
        </div>
      )}
      <ScorecardNine label="Out" hs={front} />
      <ScorecardNine label="In" hs={back} />
    </div>
  );
}

/* ── Shared tee picker ────────────────────────────────────────────────────── */
function TeePicker({ tees, selectedTeeId, onSelect }: { tees: Tee[]; selectedTeeId: string | null; onSelect: (id: string) => void }) {
  if (tees.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {tees.map((t) => {
        const cls = getTeeColorClasses(t.tee_color);
        const active = t.id === selectedTeeId;
        return (
          <button key={t.id} type="button" onClick={() => onSelect(t.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${active ? "border-green-600 text-green-700 bg-green-50" : "border-gray-200 text-gray-600"}`}>
            <span className={`inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle ${cls.bg}`} style={cls.isGradient ? { background: cls.gradientHex! } : cls.hex ? { background: cls.hex } : undefined} />
            {t.tee_name}{t.gender === "women" ? " (W)" : ""}
          </button>
        );
      })}
    </div>
  );
}
