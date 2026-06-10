"use client";

import { useEffect, useState } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface Accolade {
  id: string;
  title: string;
  user_id: string;
  user: { id: string; display_name: string; avatar_url: string | null } | null;
}

interface User {
  id: string;
  display_name: string;
}

export function AccoladesManager({ tripId }: { tripId: string }) {
  const [accolades, setAccolades] = useState<Accolade[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/accolades?trip_id=${tripId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.accolades) setAccolades(data.accolades);
      });

    fetch("/api/admin/users")
      .then((res) => res.json())
      .then((data) => {
        if (data.users) setUsers(data.users);
      });
  }, [tripId]);

  async function handleAdd() {
    if (!title.trim() || !userId) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/admin/accolades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          title: title.trim(),
          user_id: userId,
          sort_order: accolades.length,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add");
      }

      const data = await res.json();
      setAccolades([...accolades, data.accolade]);
      setTitle("");
      setUserId("");
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(id: string) {
    setConfirmModal({
      title: "Remove Accolade",
      message: "Are you sure you want to remove this accolade?",
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await fetch("/api/admin/accolades", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });

          if (!res.ok) throw new Error("Failed to delete");
          setAccolades(accolades.filter((a) => a.id !== id));
        } catch {
          setError("Failed to delete accolade");
        }
      },
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Accolades
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs font-medium text-green-700"
        >
          + Add
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-600 text-xs">{error}</div>
      )}

      <div className="divide-y divide-gray-100">
        {accolades.length === 0 && !showForm && (
          <p className="px-4 py-4 text-sm text-gray-400 text-center">
            No accolades yet
          </p>
        )}

        {accolades.map((a) => (
          <div key={a.id} className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {a.user?.avatar_url ? (
                <img src={a.user.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-xs font-bold">
                  {(a.user?.display_name || "?")[0].toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-gray-900">{a.title}</p>
                <p className="text-xs text-gray-500">
                  {a.user?.display_name || "Unknown"}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleDelete(a.id)}
              className="text-xs text-red-500 font-medium"
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="px-4 py-4 bg-green-50 border-t border-gray-200 space-y-3">
          <input
            type="text"
            placeholder="Award title (e.g. KGB Cup Champion)"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base bg-white"
          />
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base bg-white"
            style={{ backgroundColor: "white" }}
          >
            <option value="">Select recipient...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !title.trim() || !userId}
              className="px-4 py-2 bg-green-700 text-white rounded-lg font-medium text-sm disabled:opacity-50"
            >
              {saving ? "Saving..." : "Add"}
            </button>
            <button
              onClick={() => { setShowForm(false); setTitle(""); setUserId(""); }}
              className="px-4 py-2 text-gray-600 rounded-lg font-medium text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
