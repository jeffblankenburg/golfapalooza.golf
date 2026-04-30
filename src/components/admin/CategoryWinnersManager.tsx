"use client";

import { useEffect, useMemo, useState } from "react";
import { AwardBadge } from "@/components/AwardBadge";

interface UserRef {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  is_active?: boolean;
  is_system?: boolean;
  is_financial_only?: boolean;
}

interface Trip {
  id: string;
  trip_year: number;
  trip_name: string;
  status: string;
}

interface Winner {
  id: string;
  title: string;
  trip_id: string;
  user_id: string;
  partner_user_id: string | null;
  winner: UserRef[] | UserRef | null;
  partner: UserRef[] | UserRef | null;
}

interface CategoryRow {
  category: string;
  title: string;
  short_label: string;
  icon: string;
  icon_url: string | null;
  description: string | null;
  sort_order: number;
}

interface State {
  category: CategoryRow;
  trips: Trip[];
  winners: Winner[];
  users: UserRef[];
}

const TEAM_CATEGORY_HINTS = ["doubles", "team", "pair"];

function unwrap<T>(v: T[] | T | null | undefined): T | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

export function CategoryWinnersManager({ category }: { category: string }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftFor, setDraftFor] = useState<Record<string, { user_id: string; partner_user_id: string }>>({});
  const [savingFor, setSavingFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/accolades/categories/${category}/winners`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? `HTTP ${res.status}`);
          return;
        }
        setState(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category]);

  const reload = async () => {
    const res = await fetch(`/api/admin/accolades/categories/${category}/winners`);
    const data = await res.json();
    setState(data);
  };

  const winnersByTrip = useMemo(() => {
    const m = new Map<string, Winner[]>();
    for (const w of state?.winners ?? []) {
      const arr = m.get(w.trip_id) ?? [];
      arr.push(w);
      m.set(w.trip_id, arr);
    }
    return m;
  }, [state]);

  const showsPartner = useMemo(() => {
    if (!state) return false;
    const slug = state.category.category.toLowerCase();
    if (TEAM_CATEGORY_HINTS.some((h) => slug.includes(h))) return true;
    // If any existing winner has a partner, keep the partner column visible.
    return state.winners.some((w) => !!w.partner_user_id);
  }, [state]);

  const sortedUsers = useMemo(() => {
    if (!state) return [];
    return [...state.users].sort((a, b) => {
      const score = (u: UserRef) =>
        (u.is_system ? 2 : 0) + (u.is_financial_only ? 1 : 0);
      const s = score(a) - score(b);
      if (s !== 0) return s;
      return (a.full_name ?? a.display_name).localeCompare(b.full_name ?? b.display_name);
    });
  }, [state]);

  const addWinner = async (tripId: string) => {
    const draft = draftFor[tripId];
    if (!draft?.user_id) return;
    setSavingFor(tripId);
    const res = await fetch("/api/admin/accolades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trip_id: tripId,
        category,
        user_id: draft.user_id,
        partner_user_id: draft.partner_user_id || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(`Failed: ${data.error ?? res.status}`);
      setSavingFor(null);
      return;
    }
    setDraftFor((prev) => {
      const next = { ...prev };
      delete next[tripId];
      return next;
    });
    setSavingFor(null);
    await reload();
  };

  const removeWinner = async (winner: Winner) => {
    if (!confirm("Remove this winner?")) return;
    setSavingFor(winner.id);
    const res = await fetch("/api/admin/accolades", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: winner.id }),
    });
    setSavingFor(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Failed: ${data.error ?? res.status}`);
      return;
    }
    await reload();
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-800">
        {error}
      </div>
    );
  }
  if (!state) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
        <AwardBadge
          iconUrl={state.category.icon_url}
          emoji={state.category.icon}
          alt={state.category.title}
          size="lg"
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900">{state.category.title}</h1>
          {state.category.description && (
            <p className="text-xs text-gray-500 truncate">{state.category.description}</p>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        {state.winners.length} winner{state.winners.length === 1 ? "" : "s"} across {state.trips.length} trips.
      </p>

      <div className="space-y-2">
        {state.trips.map((t) => {
          const winners = winnersByTrip.get(t.id) ?? [];
          const draft = draftFor[t.id] ?? { user_id: "", partner_user_id: "" };
          const saving = savingFor === t.id;
          return (
            <div
              key={t.id}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 space-y-2"
            >
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold text-gray-900">
                  {t.trip_year} <span className="font-normal text-gray-500">{t.trip_name}</span>
                </p>
                <span className="text-[10px] text-gray-400 uppercase tracking-wide">
                  {t.status}
                </span>
              </div>

              {winners.length > 0 && (
                <div className="space-y-1">
                  {winners.map((w) => {
                    const win = unwrap(w.winner);
                    const part = unwrap(w.partner);
                    const removing = savingFor === w.id;
                    return (
                      <div
                        key={w.id}
                        className="flex items-center justify-between bg-gray-50 rounded-lg px-2 py-1.5 text-sm"
                      >
                        <span>
                          {win ? win.full_name ?? win.display_name : "—"}
                          {part && (
                            <>
                              <span className="text-gray-400">{" & "}</span>
                              {part.full_name ?? part.display_name}
                            </>
                          )}
                        </span>
                        <button
                          onClick={() => removeWinner(w)}
                          disabled={removing}
                          className="text-xs text-red-600 px-2 py-0.5 rounded hover:bg-red-100 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className={`grid ${showsPartner ? "grid-cols-2" : "grid-cols-1"} gap-2`}>
                <select
                  value={draft.user_id}
                  onChange={(e) =>
                    setDraftFor((prev) => ({
                      ...prev,
                      [t.id]: { ...draft, user_id: e.target.value },
                    }))
                  }
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                >
                  <option value="">— Pick a winner —</option>
                  {sortedUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {(u.full_name ?? u.display_name) +
                        (u.is_system ? " · bot" : "") +
                        (u.is_financial_only ? " · finOnly" : "")}
                    </option>
                  ))}
                </select>
                {showsPartner && (
                  <select
                    value={draft.partner_user_id}
                    onChange={(e) =>
                      setDraftFor((prev) => ({
                        ...prev,
                        [t.id]: { ...draft, partner_user_id: e.target.value },
                      }))
                    }
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                  >
                    <option value="">— Partner (optional) —</option>
                    {sortedUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name ?? u.display_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => addWinner(t.id)}
                  disabled={!draft.user_id || saving}
                  className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium disabled:opacity-50 active:scale-95 transition-transform"
                >
                  {saving ? "Adding…" : "Add winner"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
