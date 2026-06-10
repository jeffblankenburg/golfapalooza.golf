"use client";

import { useEffect, useMemo, useState } from "react";

interface Trip {
  id: string;
  trip_name: string;
  trip_year: number;
  status: string;
}

interface Loozer {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface Cell {
  user_id: string;
  trip_id: string;
}

const cellKey = (userId: string, tripId: string) => `${userId}|${tripId}`;

export function AttendanceGrid() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loozers, setLoozers] = useState<Loozer[]>([]);
  const [attended, setAttended] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/attendance/grid")
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) {
          setError(d.error || "Failed to load");
          setLoading(false);
          return;
        }
        setTrips(d.trips || []);
        setLoozers(d.loozers || []);
        setAttended(
          new Set((d.roster || []).map((r: Cell) => cellKey(r.user_id, r.trip_id))),
        );
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (userId: string, tripId: string) => {
    const k = cellKey(userId, tripId);
    if (pending.has(k)) return;
    const next = !attended.has(k);

    // Optimistic update
    setAttended((prev) => {
      const n = new Set(prev);
      if (next) n.add(k);
      else n.delete(k);
      return n;
    });
    setPending((p) => new Set(p).add(k));

    try {
      const res = await fetch("/api/admin/attendance/cell", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, tripId, attended: next }),
      });
      if (!res.ok) {
        setAttended((prev) => {
          const n = new Set(prev);
          if (next) n.delete(k);
          else n.add(k);
          return n;
        });
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Save failed");
      }
    } catch {
      setAttended((prev) => {
        const n = new Set(prev);
        if (next) n.delete(k);
        else n.add(k);
        return n;
      });
      setError("Save failed");
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(k);
        return n;
      });
    }
  };

  const filteredLoozers = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return loozers;
    return loozers.filter((l) => l.display_name.toLowerCase().includes(q));
  }, [loozers, search]);

  const perLoozerTotal = useMemo(() => {
    const m = new Map<string, number>();
    for (const k of attended) {
      const userId = k.split("|")[0];
      m.set(userId, (m.get(userId) || 0) + 1);
    }
    return m;
  }, [attended]);

  const perTripTotal = useMemo(() => {
    const m = new Map<string, number>();
    for (const k of attended) {
      const tripId = k.split("|")[1];
      m.set(tripId, (m.get(tripId) || 0) + 1);
    }
    return m;
  }, [attended]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic py-6 text-center">No events yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 text-red-700 p-2 rounded-lg text-xs">{error}</div>
      )}

      <input
        type="text"
        placeholder="Search Loozers…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
      />

      {/* Table is its own scroll region (both axes) so sticky cells are
          predictable cross-browser. max-height leaves room for the
          global HeaderBar + page title + search above. */}
      <div className="overflow-auto border border-gray-200 rounded-xl bg-white max-h-[calc(100vh-200px)]">
        <table className="text-xs border-collapse">
          <thead>
            {/* Top sticky relative to this scroll container. Corner cells
                bump z to 30 so they stay above both the row's sticky
                first/last cells (z-10) and the rest of the sticky thead
                (z-20). */}
            <tr className="bg-gray-50">
              <th className="sticky top-0 left-0 z-30 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider min-w-[140px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                Loozer
              </th>
              {trips.map((t) => (
                <th
                  key={t.id}
                  className="sticky top-0 z-20 bg-gray-50 px-1.5 py-2 text-center font-semibold text-gray-600 whitespace-nowrap min-w-[44px]"
                  title={t.trip_name}
                >
                  {t.trip_year}
                </th>
              ))}
              <th className="sticky top-0 right-0 z-30 bg-gray-50 px-2 py-2 text-center font-semibold text-gray-900 uppercase tracking-wider min-w-[44px] shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredLoozers.map((l, rowIdx) => {
              const total = perLoozerTotal.get(l.id) || 0;
              return (
                <tr key={l.id} className={rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  <td
                    className={`sticky left-0 z-10 px-3 py-1.5 border-b border-gray-100 font-medium text-gray-900 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] ${
                      rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {l.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={l.avatar_url}
                          alt=""
                          className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[0.5625rem] font-bold text-gray-500 flex-shrink-0">
                          {l.display_name?.[0]?.toUpperCase() || "?"}
                        </span>
                      )}
                      <span className="truncate">{l.display_name}</span>
                    </div>
                  </td>
                  {trips.map((t) => {
                    const k = cellKey(l.id, t.id);
                    const checked = attended.has(k);
                    const isPending = pending.has(k);
                    return (
                      <td
                        key={t.id}
                        className="px-1.5 py-1.5 border-b border-gray-100 text-center"
                      >
                        <button
                          type="button"
                          onClick={() => toggle(l.id, t.id)}
                          disabled={isPending}
                          aria-label={`${l.display_name} attended ${t.trip_year}`}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-colors ${
                            checked
                              ? "bg-green-600 border-green-600"
                              : "border-gray-300 bg-white hover:border-gray-400"
                          } ${isPending ? "opacity-60" : ""}`}
                        >
                          {checked && (
                            <svg
                              className="w-3 h-3 text-white"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </button>
                      </td>
                    );
                  })}
                  <td
                    className={`sticky right-0 z-10 px-2 py-1.5 border-b border-gray-100 text-center font-bold text-gray-900 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)] ${
                      rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50"
                    }`}
                  >
                    {total}
                  </td>
                </tr>
              );
            })}

            <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
              <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2 uppercase tracking-wider text-[0.625rem] text-gray-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                Totals
              </td>
              {trips.map((t) => {
                const c = perTripTotal.get(t.id) || 0;
                return (
                  <td key={t.id} className="px-1.5 py-2 text-center text-[0.625rem] text-gray-600">
                    {c || ""}
                  </td>
                );
              })}
              <td className="sticky right-0 z-10 bg-gray-50 px-2 py-2 text-center text-[0.625rem] text-gray-900 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                {attended.size}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[0.6875rem] text-gray-400 text-center">
        {loozers.length} Loozer{loozers.length === 1 ? "" : "s"} · {trips.length} event
        {trips.length === 1 ? "" : "s"} · {attended.size} marked attended · click any cell to toggle
      </p>
    </div>
  );
}
