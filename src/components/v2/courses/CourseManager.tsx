"use client";

import { useCallback, useEffect, useState } from "react";
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

export default function CourseManager({ courseId, onCourseChanged }: { courseId: string; onCourseChanged?: () => void }) {
  const [course, setCourse] = useState<Course | null>(null);
  const [tees, setTees] = useState<Tee[]>([]);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [selectedTeeId, setSelectedTeeId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("info");
  const [status, setStatus] = useState<string | null>(null);
  const [mapHole, setMapHole] = useState<Hole | null>(null);
  const [confirmDelTee, setConfirmDelTee] = useState<Tee | null>(null);

  interface Detail { course: Course; tees: Tee[]; holes: Hole[]; selected_tee_id: string | null }
  const fetchDetail = useCallback(async (teeId?: string): Promise<Detail | null> => {
    const qs = teeId ? `?tee_id=${teeId}` : "";
    const res = await fetch(`/api/v2/courses/${courseId}${qs}`);
    return res.ok ? ((await res.json()) as Detail) : null;
  }, [courseId]);

  // Reload for event handlers (setState in a handler is fine; not an effect).
  const reload = useCallback(async (teeId?: string) => {
    const d = await fetchDetail(teeId);
    if (!d) return;
    setCourse(d.course); setTees(d.tees || []); setHoles(d.holes || []); setSelectedTeeId(d.selected_tee_id || null);
  }, [fetchDetail]);

  useEffect(() => {
    let active = true;
    (async () => {
      const d = await fetchDetail();
      if (active && d) { setCourse(d.course); setTees(d.tees || []); setHoles(d.holes || []); setSelectedTeeId(d.selected_tee_id || null); }
    })();
    return () => { active = false; };
  }, [fetchDetail]);

  function flash(msg: string) {
    setStatus(msg);
    setTimeout(() => setStatus(null), 2000);
  }

  if (!course) return <div className="py-12 text-center text-sm text-gray-500">Loading course…</div>;

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
        <InfoTab course={course} onSaved={(c) => { setCourse(c); flash("Saved"); onCourseChanged?.(); }} />
      )}
      {tab === "tees" && (
        <TeesTab
          tees={tees}
          onReload={() => reload(selectedTeeId || undefined)}
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
          onSelectTee={(id) => { setSelectedTeeId(id); reload(id); }}
          onReload={() => reload(selectedTeeId || undefined)}
          flash={flash}
        />
      )}
      {tab === "map" && (
        <MapTab
          tees={tees}
          holes={holes}
          selectedTeeId={selectedTeeId}
          onSelectTee={(id) => { setSelectedTeeId(id); reload(id); }}
          onOpenHole={setMapHole}
        />
      )}
      {tab === "scorecard" && (
        <ScorecardTab tees={tees} holes={holes} selectedTeeId={selectedTeeId} onSelectTee={(id) => { setSelectedTeeId(id); reload(id); }} />
      )}

      {mapHole && course && (
        <div className="fixed inset-0 z-[70] bg-black">
          <HoleMapEditor
            holeNumber={mapHole.hole_number}
            courseId={courseId}
            courseLatitude={course.latitude}
            courseLongitude={course.longitude}
            courseAddress={course.address}
            courseName={course.name}
            courseCity={course.city}
            courseState={course.state}
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
              if (res.ok) { setMapHole(null); await reload(selectedTeeId || undefined); flash("Map saved"); onCourseChanged?.(); }
            }}
            onClose={() => setMapHole(null)}
          />
        </div>
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
          if (res.ok) { await reload(); flash("Tee deleted"); } else { flash((await res.json().catch(() => ({}))).error || "Could not delete"); }
        }}
        onCancel={() => setConfirmDelTee(null)}
      />
    </div>
  );
}

/* ── Info ─────────────────────────────────────────────────────────────────── */
function InfoTab({ course, onSaved }: { course: Course; onSaved: (c: Course) => void }) {
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

/* ── Tees ─────────────────────────────────────────────────────────────────── */
function TeesTab({ tees, onReload, onDelete, courseId, flash }: {
  tees: Tee[]; onReload: () => void; onDelete: (t: Tee) => void; courseId: string; flash: (m: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  async function addTee() {
    if (!newName.trim()) return;
    const res = await fetch(`/api/v2/courses/tees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_id: courseId, tee_name: newName.trim() }),
    });
    if (res.ok) { setNewName(""); setAdding(false); onReload(); flash("Tee added"); }
  }
  async function saveTee(t: Tee) {
    const res = await fetch(`/api/v2/courses/tees`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tee_id: t.id, tee_name: t.tee_name, tee_color: t.tee_color, course_rating: t.course_rating, slope_rating: t.slope_rating, par: t.par }),
    });
    if (res.ok) flash("Tee saved");
  }

  return (
    <div className="space-y-3">
      {tees.map((t) => <TeeRow key={t.id} tee={t} onSave={saveTee} onDelete={onDelete} canDelete={tees.length > 1} />)}

      {adding ? (
        <div className="flex gap-2">
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tee name (e.g. Blue)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg" />
          <button type="button" onClick={addTee} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium">Add</button>
          <button type="button" onClick={() => setAdding(false)} className="px-3 py-2 text-gray-500 text-sm">Cancel</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="text-sm font-semibold text-green-700">+ Add tee box</button>
      )}
    </div>
  );
}

function TeeRow({ tee, onSave, onDelete, canDelete }: { tee: Tee; onSave: (t: Tee) => void; onDelete: (t: Tee) => void; canDelete: boolean }) {
  const [t, setT] = useState(tee);
  // Reset local edits when the tee prop identity changes (after a reload).
  const [seen, setSeen] = useState(tee);
  if (seen !== tee) { setSeen(tee); setT(tee); }
  const cls = getTeeColorClasses(t.tee_color);
  const input = "w-full px-2 py-1.5 border border-gray-300 rounded text-sm";
  return (
    <div className="border border-gray-200 rounded-xl p-3 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-5 h-5 rounded-full ${cls.bg}`} style={cls.isGradient ? { background: cls.gradientHex! } : cls.hex ? { background: cls.hex } : undefined} />
        <input value={t.tee_name} onChange={(e) => setT({ ...t, tee_name: e.target.value })} className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm font-medium" />
        {canDelete && <button type="button" onClick={() => onDelete(tee)} className="text-xs text-red-600 font-medium">Delete</button>}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {TEE_COLOR_OPTIONS.map((c) => (
          <button key={c.value} type="button" title={c.label} onClick={() => setT({ ...t, tee_color: c.value })}
            className={`w-6 h-6 rounded-full ${c.bg} ${t.tee_color === c.value ? "ring-2 ring-green-500 ring-offset-1" : ""}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><label className="block text-[0.65rem] text-gray-500">Par</label><input type="number" className={input} value={t.par} onChange={(e) => setT({ ...t, par: parseInt(e.target.value) || 0 })} /></div>
        <div><label className="block text-[0.65rem] text-gray-500">Rating</label><input type="number" step="0.1" className={input} value={t.course_rating ?? ""} onChange={(e) => setT({ ...t, course_rating: e.target.value ? parseFloat(e.target.value) : null })} /></div>
        <div><label className="block text-[0.65rem] text-gray-500">Slope</label><input type="number" className={input} value={t.slope_rating ?? ""} onChange={(e) => setT({ ...t, slope_rating: e.target.value ? parseInt(e.target.value) : null })} /></div>
      </div>
      <button type="button" onClick={() => onSave(t)} className="mt-2 text-sm font-semibold text-green-700">Save tee</button>
    </div>
  );
}

/* ── Holes ────────────────────────────────────────────────────────────────── */
function HolesTab({ tees, holes, selectedTeeId, onSelectTee, onReload, flash }: {
  tees: Tee[]; holes: Hole[]; selectedTeeId: string | null; onSelectTee: (id: string) => void; onReload: () => void; flash: (m: string) => void;
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

  const cell = "w-full px-1.5 py-1 border border-gray-300 rounded text-sm text-center";
  return (
    <div>
      <TeePicker tees={tees} selectedTeeId={selectedTeeId} onSelect={onSelectTee} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[0.65rem] text-gray-500 uppercase">
              <th className="text-left py-1">#</th><th className="py-1">Par</th><th className="py-1">Hcp</th><th className="py-1">Yards</th><th className="text-left py-1 pl-2">Name</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id}>
                <td className="py-1 pr-2 font-medium text-gray-700">{h.hole_number}</td>
                <td className="py-1 px-0.5 w-14"><input type="number" className={cell} value={h.par} onChange={(e) => setRow(h.id, "par", parseInt(e.target.value) || 0)} /></td>
                <td className="py-1 px-0.5 w-14"><input type="number" className={cell} value={h.handicap_index} onChange={(e) => setRow(h.id, "handicap_index", parseInt(e.target.value) || 0)} /></td>
                <td className="py-1 px-0.5 w-16"><input type="number" className={cell} value={h.yards ?? ""} onChange={(e) => setRow(h.id, "yards", e.target.value ? parseInt(e.target.value) : null)} /></td>
                <td className="py-1 pl-2"><input className="w-full px-2 py-1 border border-gray-300 rounded text-sm" value={h.hole_name ?? ""} onChange={(e) => setRow(h.id, "hole_name", e.target.value)} placeholder="—" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={save} disabled={saving} className="mt-3 w-full py-3 bg-green-600 text-white font-semibold rounded-lg disabled:opacity-50">
        {saving ? "Saving…" : "Save holes"}
      </button>
    </div>
  );
}

/* ── Map ──────────────────────────────────────────────────────────────────── */
function MapTab({ tees, holes, selectedTeeId, onSelectTee, onOpenHole }: {
  tees: Tee[]; holes: Hole[]; selectedTeeId: string | null; onSelectTee: (id: string) => void; onOpenHole: (h: Hole) => void;
}) {
  return (
    <div>
      <TeePicker tees={tees} selectedTeeId={selectedTeeId} onSelect={onSelectTee} />
      <div className="space-y-1.5">
        {holes.map((h) => {
          const n = mappedCount(h);
          return (
            <button key={h.id} type="button" onClick={() => onOpenHole(h)}
              className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-xl bg-white active:bg-gray-50">
              <span className="font-medium text-gray-800">Hole {h.hole_number}{h.hole_name ? ` — ${h.hole_name}` : ""}</span>
              <span className={`text-xs font-medium ${n === 5 ? "text-green-700" : n === 0 ? "text-gray-400" : "text-amber-600"}`}>
                {n === 5 ? "Mapped" : `${n}/5`}
              </span>
            </button>
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

function ScorecardNine({ label, hs }: { label: string; hs: Hole[] }) {
  if (hs.length === 0) return null;
  return (
    <div className="overflow-x-auto mb-3">
      <table className="w-full text-xs text-center border-collapse">
        <thead>
          <tr className="text-gray-500">
            <th className="text-left py-1 pr-2">{label}</th>
            {hs.map((h) => <th key={h.id} className="py-1 px-1">{h.hole_number}</th>)}
            <th className="py-1 px-1 font-semibold">Tot</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-gray-200"><td className="text-left py-1 pr-2 text-gray-500">Par</td>{hs.map((h) => <td key={h.id} className="py-1">{h.par}</td>)}<td className="py-1 font-semibold">{sumHoles(hs, "par")}</td></tr>
          <tr className="border-t border-gray-100"><td className="text-left py-1 pr-2 text-gray-500">Yds</td>{hs.map((h) => <td key={h.id} className="py-1">{h.yards ?? "—"}</td>)}<td className="py-1 font-semibold">{sumHoles(hs, "yards") || "—"}</td></tr>
          <tr className="border-t border-gray-100"><td className="text-left py-1 pr-2 text-gray-500">Hcp</td>{hs.map((h) => <td key={h.id} className="py-1 text-gray-400">{h.handicap_index}</td>)}<td /></tr>
        </tbody>
      </table>
    </div>
  );
}

function ScorecardTab({ tees, holes, selectedTeeId, onSelectTee }: {
  tees: Tee[]; holes: Hole[]; selectedTeeId: string | null; onSelectTee: (id: string) => void;
}) {
  const front = holes.filter((h) => h.hole_number <= 9);
  const back = holes.filter((h) => h.hole_number > 9);
  const yds = sumHoles(holes, "yards");
  return (
    <div>
      <TeePicker tees={tees} selectedTeeId={selectedTeeId} onSelect={onSelectTee} />
      <ScorecardNine label="Front" hs={front} />
      <ScorecardNine label="Back" hs={back} />
      <div className="text-sm font-semibold text-gray-800">Total par {sumHoles(holes, "par")}{yds ? ` (${yds} yds)` : ""}</div>
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
            {t.tee_name}
          </button>
        );
      })}
    </div>
  );
}
