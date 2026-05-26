"use client";

import { useEffect, useMemo, useState } from "react";
import { BottomDrawer } from "@/components/admin/BottomDrawer";

interface Loozer {
  id: string;
  display_name: string;
  full_name: string | null;
}

interface AddPlayerDrawerProps {
  open: boolean;
  roundId: string;
  excludedUserIds: string[];
  onClose: () => void;
  onAdded: (userId: string) => void;
}

export function AddPlayerDrawer({
  open,
  roundId,
  excludedUserIds,
  onClose,
  onAdded,
}: AddPlayerDrawerProps) {
  const [loozers, setLoozers] = useState<Loozer[]>([]);
  const [query, setQuery] = useState("");
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setError(null);
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/users/list");
      if (!res.ok || cancelled) return;
      const json = await res.json();
      if (!cancelled) setLoozers(json.users || []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const excluded = useMemo(() => new Set(excludedUserIds), [excludedUserIds]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return loozers
      .filter((l) => !excluded.has(l.id))
      .filter((l) => {
        if (!q) return true;
        return (
          l.display_name.toLowerCase().includes(q) ||
          (l.full_name || "").toLowerCase().includes(q)
        );
      });
  }, [loozers, query, excluded]);

  async function addPlayer(userId: string) {
    setAddingUserId(userId);
    setError(null);
    try {
      const res = await fetch(`/api/rounds/${roundId}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || `Failed to add player (${res.status})`);
        return;
      }
      onAdded(userId);
    } catch {
      setError("Network error — please try again");
    } finally {
      setAddingUserId(null);
    }
  }

  return (
    <BottomDrawer open={open} onClose={onClose} title="Add player">
      <div className="px-6 pt-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Loozers..."
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40"
        />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
      <div className="px-6 mt-2 divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <p className="py-6 text-sm text-gray-500 text-center">
            {loozers.length === 0
              ? "Loading Loozers..."
              : query
                ? "No matching Loozers"
                : "Everyone is already in this round"}
          </p>
        ) : (
          filtered.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => addPlayer(l.id)}
              disabled={addingUserId !== null}
              className="w-full text-left py-3 flex items-center justify-between active:bg-gray-50 disabled:opacity-50"
            >
              <div>
                <div className="text-sm font-medium text-gray-900">{l.display_name}</div>
                {l.full_name && l.full_name !== l.display_name && (
                  <div className="text-xs text-gray-500">{l.full_name}</div>
                )}
              </div>
              <span className="text-sm text-green-700 font-semibold">
                {addingUserId === l.id ? "Adding..." : "Add"}
              </span>
            </button>
          ))
        )}
      </div>
    </BottomDrawer>
  );
}
