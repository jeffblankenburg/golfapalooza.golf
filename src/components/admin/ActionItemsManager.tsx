"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface ActionItem {
  id: string;
  trip_id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  link: string | null;
  sort_order: number;
}

const emptyForm = {
  title: "",
  description: "",
  deadline: "",
  link: "",
  sort_order: 0,
};

export function ActionItemsManager({ tripId: propTripId }: { tripId?: string } = {}) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [tripId, setTripId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const fetchItems = useCallback(async () => {
    const url = propTripId
      ? `/api/admin/action-items?trip_id=${propTripId}`
      : "/api/admin/action-items";
    const res = await fetch(url);
    const data = await res.json();
    if (data.items) setItems(data.items);
    if (data.tripId) setTripId(data.tripId);
  }, [propTripId]);

  useEffect(() => {
    setLoading(true);
    fetchItems().finally(() => setLoading(false));
  }, [fetchItems]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, sort_order: items.length + 1 });
    setShowForm(true);
  };

  const openEdit = (item: ActionItem) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      description: item.description || "",
      deadline: item.deadline || "",
      link: item.link || "",
      sort_order: item.sort_order,
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !tripId) return;
    setSaving(true);

    if (editingId) {
      await fetch("/api/admin/action-items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...form }),
      });
    } else {
      await fetch("/api/admin/action-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: tripId, ...form }),
      });
    }

    await fetchItems();
    cancelForm();
    setSaving(false);
  };

  const handleDelete = (id: string) => {
    setConfirmModal({
      title: "Delete Action Item",
      message: "Are you sure you want to delete this action item?",
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch("/api/admin/action-items", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        await fetchItems();
      },
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!tripId) {
    return (
      <div className="text-center py-12 text-gray-500">
        No active event found. Create one in Trip Settings.
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">
            Action Items ({items.length})
          </h2>
          {!showForm && (
            <button
              onClick={openAdd}
              className="text-xs text-green-700 font-medium px-2 py-1 rounded-lg hover:bg-green-50"
            >
              + Add
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <div className="px-4 py-4 border-b border-gray-100 bg-green-50">
            <input
              type="text"
              placeholder="Title (required)"
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px] mb-2 bg-white"
            />
            <textarea
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px] mb-2 bg-white"
              style={{ backgroundColor: "white" }}
            />
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">
                  Deadline
                </label>
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(e) =>
                    setForm({ ...form, deadline: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px] bg-white"
                />
              </div>
              <div className="w-20">
                <label className="text-xs text-gray-500 mb-1 block">
                  Order
                </label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      sort_order: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px] bg-white"
                />
              </div>
            </div>
            <input
              type="text"
              placeholder="Link (optional, e.g. /profile)"
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px] mb-3 bg-white"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={!form.title.trim() || saving}
                className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Update"
                    : "Create"}
              </button>
              <button
                onClick={cancelForm}
                className="px-4 text-sm text-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Items List */}
        <div className="divide-y divide-gray-50">
          {items.map((item) => (
            <div key={item.id} className="px-4 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {item.title}
                </p>
                {item.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                    {item.description}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-1">
                  {item.deadline && (
                    <span className="text-xs text-gray-400">
                      Due:{" "}
                      {new Date(item.deadline + "T00:00:00").toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                        }
                      )}
                    </span>
                  )}
                  {item.link && (
                    <span className="text-xs text-blue-500">{item.link}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => openEdit(item)}
                className="text-gray-400 hover:text-green-600 p-1"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </button>
              <button
                onClick={() => handleDelete(item.id)}
                className="text-gray-300 hover:text-red-500 p-1"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          ))}
          {items.length === 0 && !showForm && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No action items yet. Tap &quot;+ Add&quot; to create one.
            </div>
          )}
        </div>
      </div>
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
