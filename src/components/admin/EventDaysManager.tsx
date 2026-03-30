"use client";

import { useEffect, useState, useCallback } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface EventDay {
  id: string;
  trip_id: string;
  day_number: number;
  name: string;
  date: string | null;
}

export function EventDaysManager({ tripId }: { tripId: string }) {
  const [days, setDays] = useState<EventDay[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const fetchDays = useCallback(async () => {
    const res = await fetch(`/api/admin/event-days?trip_id=${tripId}`);
    const data = await res.json();
    if (data.days) setDays(data.days);
  }, [tripId]);

  useEffect(() => {
    fetchDays();
  }, [fetchDays]);

  function notifyChange() {
    window.dispatchEvent(new CustomEvent("event-days-changed"));
  }

  async function handleAdd() {
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/admin/event-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: tripId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add day");
      }

      await fetchDays();
      notifyChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add day");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(day: EventDay) {
    setEditingId(day.id);
    setEditName(day.name);
  }

  async function handleSaveEdit() {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/admin/event-days", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          name: editName.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update");
      }

      setEditingId(null);
      await fetchDays();
      notifyChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(day: EventDay) {
    setConfirmModal({
      title: "Delete Day",
      message: `Delete Day ${day.day_number} (${day.name})? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        setError("");

        try {
          const res = await fetch("/api/admin/event-days", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: day.id }),
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to delete");
          }

          await fetchDays();
          notifyChange();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to delete");
        }
      },
    });
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "";
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      {days.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">
          No event days configured yet.
        </p>
      ) : (
        <div className="space-y-2">
          {days.map((day) => (
            <div
              key={day.id}
              className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center gap-2"
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-green-100 text-green-800 text-xs font-bold flex-shrink-0">
                {day.day_number}
              </div>

              {editingId === day.id ? (
                <div className="flex-1 flex flex-col gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="px-2 py-1 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {day.name}
                    </span>
                    {day.date && (
                      <p className="text-xs text-gray-500">{formatDate(day.date)}</p>
                    )}
                  </div>

                  <button
                    onClick={() => startEdit(day)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-200"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>

                  <button
                    onClick={() => handleDelete(day)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleAdd}
        disabled={saving}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-xl hover:bg-green-100 disabled:opacity-50 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Day
      </button>

      <ConfirmModal
        open={confirmModal !== null}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        destructive
        confirmLabel="Delete"
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
