"use client";

import { useEffect, useState } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface ItineraryItem {
  id: string;
  trip_id: string;
  title: string;
  location: string | null;
  day_number: number | null;
  start_date: string | null;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  sort_order: number;
}

interface FormData {
  title: string;
  location: string;
  day_number: number | null;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  sort_order: number;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getDayDate(startDate: string, offset: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  const d = new Date(year, month - 1, day + offset - 1);
  return `${DAY_NAMES[d.getDay()]} ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return "";
  const [, month, day] = dateStr.split("-").map(Number);
  return `${month}/${day}`;
}

const emptyForm: FormData = {
  title: "",
  location: "",
  day_number: null,
  start_date: "",
  start_time: "",
  end_date: "",
  end_time: "",
  sort_order: 0,
};

export function ItineraryManager({ tripId: propTripId }: { tripId?: string } = {}) {
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [tripId, setTripId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [eventDays, setEventDays] = useState<{ day_number: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingForDay, setAddingForDay] = useState<number | null | undefined>(undefined);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  async function fetchItems() {
    try {
      const url = propTripId
        ? `/api/admin/itinerary?trip_id=${propTripId}`
        : "/api/admin/itinerary";
      const res = await fetch(url);
      const data = await res.json();
      if (data.items) {
        setItems(data.items);
        setTripId(data.tripId);
        setStartDate(data.startDate);
      } else {
        setError(data.error || "Failed to load");
      }
    } catch {
      setError("Failed to load itinerary");
    } finally {
      setLoading(false);
    }
  }

  async function fetchEventDays(tid: string) {
    try {
      const res = await fetch(`/api/admin/event-days?trip_id=${tid}`);
      const data = await res.json();
      if (data.days) setEventDays(data.days);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propTripId]);

  useEffect(() => {
    if (tripId) fetchEventDays(tripId);
  }, [tripId]);

  useEffect(() => {
    const handler = () => { if (tripId) fetchEventDays(tripId); };
    window.addEventListener("event-days-changed", handler);
    return () => window.removeEventListener("event-days-changed", handler);
  }, [tripId]);

  function startAdd(dayNumber: number | null) {
    setEditingId(null);
    setAddingForDay(dayNumber);
    setForm({ ...emptyForm, day_number: dayNumber });
  }

  function startEdit(item: ItineraryItem) {
    setAddingForDay(undefined);
    setEditingId(item.id);
    setForm({
      title: item.title,
      location: item.location || "",
      day_number: item.day_number,
      start_date: item.start_date || "",
      start_time: item.start_time?.slice(0, 5) || "",
      end_date: item.end_date || "",
      end_time: item.end_time?.slice(0, 5) || "",
      sort_order: item.sort_order,
    });
  }

  function cancelForm() {
    setEditingId(null);
    setAddingForDay(undefined);
    setForm(emptyForm);
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    setError("");

    try {
      const isPreEvent = form.day_number === null;
      const body = {
        ...(editingId ? { id: editingId } : { trip_id: tripId }),
        title: form.title.trim(),
        location: form.location.trim() || null,
        day_number: form.day_number,
        start_date: isPreEvent ? form.start_date || null : null,
        start_time: form.start_time || null,
        end_date: isPreEvent ? form.end_date || null : null,
        end_time: form.end_time || null,
        sort_order: form.sort_order,
      };

      const res = await fetch("/api/admin/itinerary", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      cancelForm();
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(id: string) {
    setConfirmModal({
      title: "Delete Item",
      message: "Are you sure you want to delete this item?",
      onConfirm: async () => {
        setConfirmModal(null);
        setError("");
        try {
          const res = await fetch("/api/admin/itinerary", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to delete");
          }

          await fetchItems();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to delete");
        }
      },
    });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Group items by day_number
  const preEvent = items.filter((i) => i.day_number === null);
  const days = eventDays.length > 0 ? eventDays.map((d) => d.day_number) : [1, 2, 3, 4];
  const dayItems = days.map((d) => items.filter((i) => i.day_number === d));

  const isPreEvent = form.day_number === null;

  const formCard = (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-3 space-y-3">
      <input
        type="text"
        placeholder="Title *"
        autoFocus
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base bg-white"
      />
      <input
        type="text"
        placeholder="Location"
        value={form.location}
        onChange={(e) => setForm({ ...form, location: e.target.value })}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base bg-white"
      />
      <div className="grid grid-cols-2 gap-3">
        {isPreEvent && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Start Date</label>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base bg-white"
              style={{ backgroundColor: "white" }}
            />
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start Time</label>
          <input
            type="time"
            value={form.start_time}
            onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base bg-white"
            style={{ backgroundColor: "white" }}
          />
        </div>
        {isPreEvent && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">End Date</label>
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base bg-white"
              style={{ backgroundColor: "white" }}
            />
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">End Time</label>
          <input
            type="time"
            value={form.end_time}
            onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base bg-white"
            style={{ backgroundColor: "white" }}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Sort Order</label>
        <input
          type="number"
          value={form.sort_order}
          onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
          className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-base bg-white"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !form.title.trim()}
          className="px-4 py-2 bg-green-700 text-white rounded-lg font-medium text-sm disabled:opacity-50"
        >
          {saving ? "Saving..." : editingId ? "Update" : "Add"}
        </button>
        <button
          onClick={cancelForm}
          className="px-4 py-2 text-gray-600 rounded-lg font-medium text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {/* Pre-Event Section */}
      <DaySection
        title="Pre-Event"
        items={preEvent}
        isPreEvent
        startDate={startDate}
        onAdd={() => startAdd(null)}
        onEdit={startEdit}
        onDelete={handleDelete}
        editingId={editingId}
        showForm={addingForDay === null || (editingId !== null && preEvent.some((i) => i.id === editingId))}
        formCard={formCard}
      />

      {/* Daily Sections */}
      {days.map((dayNum, idx) => (
        <DaySection
          key={dayNum}
          title={startDate ? `Day ${dayNum} — ${getDayDate(startDate, dayNum)}` : `Day ${dayNum}`}
          items={dayItems[idx]}
          isPreEvent={false}
          startDate={startDate}
          onAdd={() => startAdd(dayNum)}
          onEdit={startEdit}
          onDelete={handleDelete}
          editingId={editingId}
          showForm={addingForDay === dayNum || (editingId !== null && dayItems[idx].some((i) => i.id === editingId))}
          formCard={formCard}
        />
      ))}

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

function DaySection({
  title,
  items,
  isPreEvent,
  onAdd,
  onEdit,
  onDelete,
  editingId,
  showForm,
  formCard,
}: {
  title: string;
  items: ItineraryItem[];
  isPreEvent: boolean;
  startDate: string;
  onAdd: () => void;
  onEdit: (item: ItineraryItem) => void;
  onDelete: (id: string) => void;
  editingId: string | null;
  showForm: boolean;
  formCard: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  // Auto-expand when a form is shown inside this section
  const hasActiveForm = showForm || (editingId !== null && items.some((i) => i.id === editingId));
  if (hasActiveForm && !open) setOpen(true);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            {title}
          </h2>
          {!open && items.length > 0 && (
            <span className="text-xs text-gray-400 font-normal normal-case">
              ({items.length} item{items.length !== 1 ? "s" : ""})
            </span>
          )}
        </button>
        <button
          onClick={onAdd}
          className="text-xs font-medium text-green-700 active:text-green-900"
        >
          + Add
        </button>
      </div>

      {open && (
        <>
          <div className="divide-y divide-gray-100">
            {items.length === 0 && !showForm && (
              <p className="px-4 py-4 text-sm text-gray-400 text-center">No items yet</p>
            )}
            {items.map((item) => (
              <div key={item.id}>
                {editingId === item.id ? (
                  <div className="px-4 py-2">{formCard}</div>
                ) : (
                  <div className="px-4 py-3 flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                      {item.location && (
                        <p className="text-xs text-gray-500 mt-0.5">{item.location}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {isPreEvent ? (
                          <>
                            {formatDateShort(item.start_date)}
                            {item.start_time ? ` ${formatTime(item.start_time)}` : ""}
                            {item.end_date ? ` — ${formatDateShort(item.end_date)}` : ""}
                            {item.end_time && !item.end_date ? ` - ${formatTime(item.end_time)}` : ""}
                            {item.end_time && item.end_date ? ` ${formatTime(item.end_time)}` : ""}
                          </>
                        ) : (
                          <>
                            {formatTime(item.start_time)}
                            {item.end_time ? ` - ${formatTime(item.end_time)}` : ""}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => onEdit(item)}
                        className="text-xs text-blue-600 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(item.id)}
                        className="text-xs text-red-500 font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {showForm && editingId === null && <div className="px-4 pb-4">{formCard}</div>}
        </>
      )}
    </div>
  );
}
