"use client";

import { useEffect, useState, useCallback } from "react";
import { AccoladesManager } from "./AccoladesManager";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { US_TIMEZONE_OPTIONS } from "@/lib/utils/timezone";

interface TripData {
  id: string;
  trip_name: string;
  trip_year: number;
  start_date: string;
  timezone: string;
  location: string | null;
  hotel_name: string | null;
  hotel_address: string | null;
  notes: string | null;
  status: string;
  tee_time_reminder_minutes: number;
}

interface TripSummary {
  id: string;
  trip_name: string;
  trip_year: number;
  status: string;
}

export function TripSettings({ tripId: propTripId, hideEventList }: { tripId?: string; hideEventList?: boolean } = {}) {
  const [trip, setTrip] = useState<TripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [allEvents, setAllEvents] = useState<TripSummary[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newTrip, setNewTrip] = useState({ trip_name: "", start_date: "", end_date: "", status: "active", timezone: "America/New_York" });
  const [creating, setCreating] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    destructive?: boolean;
  } | null>(null);

  const fetchTrip = useCallback(async () => {
    try {
      const url = propTripId
        ? `/api/admin/trips?id=${propTripId}`
        : "/api/admin/trips?status=active";
      const res = await fetch(url);
      const data = await res.json();
      if (data.trip) {
        setTrip(data.trip);
      } else {
        setTrip(null);
      }
    } catch {
      setError("Failed to load trip settings");
    } finally {
      setLoading(false);
    }
  }, [propTripId]);

  const fetchAllEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/trips?status=all");
      const data = await res.json();
      if (data.trips) setAllEvents(data.trips);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchTrip();
    fetchAllEvents();
  }, [fetchTrip, fetchAllEvents]);

  async function handleSave() {
    if (!trip) return;
    setSaveStatus("saving");
    setError("");

    try {
      const res = await fetch("/api/admin/trips", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trip),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaveStatus("idle");
    }
  }

  function handleArchive() {
    if (!trip) return;

    setConfirmModal({
      title: "Archive Event",
      message: `Archive ${trip.trip_name}? All data will be preserved and viewable in past events.`,
      onConfirm: async () => {
        setConfirmModal(null);
        setError("");
        try {
          const res = await fetch("/api/admin/trips", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: trip.id }),
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to archive");
          }

          setTrip(null);
          await fetchAllEvents();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to archive");
        }
      },
    });
  }

  async function handleCreate() {
    if (!newTrip.trip_name || !newTrip.start_date || !newTrip.end_date) return;
    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/admin/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_name: newTrip.trip_name,
          start_date: newTrip.start_date,
          end_date: newTrip.end_date,
          status: newTrip.status,
          timezone: newTrip.timezone,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create");
      }

      setNewTrip({ trip_name: "", start_date: "", end_date: "", status: "active", timezone: "America/New_York" });
      setShowCreate(false);
      await fetchTrip();
      await fetchAllEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setCreating(false);
    }
  }

  function handleSetActive(eventId: string) {
    setConfirmModal({
      title: "Set Active",
      message: "Set this event as active? The current active event will be archived.",
      onConfirm: async () => {
        setConfirmModal(null);
        handleSetActiveConfirmed(eventId);
      },
    });
  }

  async function handleSetActiveConfirmed(eventId: string) {
    setError("");

    try {
      const res = await fetch("/api/admin/trips", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: eventId, status: "active" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to set active");
      }

      await fetchTrip();
      await fetchAllEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set active");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // No active event — show notice + all events + create
  if (!trip) {
    return (
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm text-amber-800 font-medium">No active event. Set one active below or create a new one.</p>
        </div>

        <AllEventsList
          events={allEvents}
          activeId={null}
          onSetActive={handleSetActive}
          showCreate={showCreate}
          setShowCreate={setShowCreate}
          newTrip={newTrip}
          setNewTrip={setNewTrip}
          creating={creating}
          handleCreate={handleCreate}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {/* Trip Info */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Trip Info
          </h2>
        </div>
        <div className="divide-y divide-gray-100">
          <Field label="Trip Name">
            <input
              type="text"
              value={trip.trip_name}
              onChange={(e) => setTrip({ ...trip, trip_name: e.target.value })}
              className="w-full text-right text-base text-gray-900 bg-transparent outline-none"
            />
          </Field>
          <Field label="Trip Year">
            <input
              type="number"
              value={trip.trip_year}
              onChange={(e) =>
                setTrip({ ...trip, trip_year: parseInt(e.target.value) || 0 })
              }
              className="w-full text-right text-base text-gray-900 bg-transparent outline-none"
            />
          </Field>
          <Field label="Start Date">
            <input
              type="date"
              value={trip.start_date}
              onChange={(e) => setTrip({ ...trip, start_date: e.target.value })}
              className="w-full text-right text-base text-gray-900 bg-transparent outline-none"
              style={{ backgroundColor: "transparent" }}
            />
          </Field>
          <Field label="Timezone">
            <select
              value={trip.timezone || "America/New_York"}
              onChange={(e) => setTrip({ ...trip, timezone: e.target.value })}
              className="w-full text-right text-base text-gray-900 bg-transparent outline-none"
              style={{ backgroundColor: "transparent" }}
            >
              {US_TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Tee Time Reminder">
            <div className="flex items-center gap-2 justify-end">
              <input
                type="number"
                min="0"
                max="120"
                value={trip.tee_time_reminder_minutes ?? 30}
                onChange={(e) =>
                  setTrip({ ...trip, tee_time_reminder_minutes: parseInt(e.target.value) || 0 })
                }
                className="w-16 text-right text-base text-gray-900 bg-transparent outline-none"
              />
              <span className="text-sm text-gray-500">min before</span>
            </div>
          </Field>
        </div>

      </div>

      {/* Location */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Location
          </h2>
        </div>
        <div className="divide-y divide-gray-100">
          <Field label="Location">
            <input
              type="text"
              value={trip.location || ""}
              onChange={(e) => setTrip({ ...trip, location: e.target.value })}
              placeholder="e.g. Myrtle Beach, SC"
              className="w-full text-right text-base text-gray-900 bg-transparent outline-none placeholder:text-gray-300"
            />
          </Field>
          <Field label="Hotel">
            <input
              type="text"
              value={trip.hotel_name || ""}
              onChange={(e) => setTrip({ ...trip, hotel_name: e.target.value })}
              placeholder="Hotel name"
              className="w-full text-right text-base text-gray-900 bg-transparent outline-none placeholder:text-gray-300"
            />
          </Field>
          <div className="px-4 py-3">
            <label className="block text-sm text-gray-500 mb-1">Hotel Address</label>
            <textarea
              value={trip.hotel_address || ""}
              onChange={(e) => setTrip({ ...trip, hotel_address: e.target.value })}
              placeholder="Full address"
              rows={2}
              className="w-full text-base text-gray-900 bg-transparent outline-none resize-none placeholder:text-gray-300"
              style={{ backgroundColor: "transparent" }}
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Notes
          </h2>
        </div>
        <div className="px-4 py-3">
          <textarea
            value={trip.notes || ""}
            onChange={(e) => setTrip({ ...trip, notes: e.target.value })}
            placeholder="Trip notes, reminders, etc."
            rows={4}
            className="w-full text-base text-gray-900 bg-transparent outline-none resize-none placeholder:text-gray-300"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saveStatus === "saving"}
        className={`w-full py-3 rounded-xl text-white font-semibold text-base transition-colors ${
          saveStatus === "saved"
            ? "bg-green-500"
            : saveStatus === "saving"
              ? "bg-gray-400"
              : "bg-green-700 active:bg-green-800"
        }`}
      >
        {saveStatus === "saving"
          ? "Saving..."
          : saveStatus === "saved"
            ? "Saved!"
            : "Save Changes"}
      </button>

      {!hideEventList && (
        <>
          {/* Accolades */}
          <AccoladesManager tripId={trip.id} />

          {/* All Events */}
          <AllEventsList
            events={allEvents}
            activeId={trip.id}
            onSetActive={handleSetActive}
            onArchive={handleArchive}
            showCreate={showCreate}
            setShowCreate={setShowCreate}
            newTrip={newTrip}
            setNewTrip={setNewTrip}
            creating={creating}
            handleCreate={handleCreate}
          />
        </>
      )}

      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        confirmLabel="Confirm"
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}

function AllEventsList({
  events,
  activeId,
  onSetActive,
  onArchive,
  showCreate,
  setShowCreate,
  newTrip,
  setNewTrip,
  creating,
  handleCreate,
}: {
  events: TripSummary[];
  activeId: string | null;
  onSetActive: (id: string) => void;
  onArchive?: () => void;
  showCreate: boolean;
  setShowCreate: (v: boolean) => void;
  newTrip: { trip_name: string; start_date: string; end_date: string; status: string; timezone: string };
  setNewTrip: (v: { trip_name: string; start_date: string; end_date: string; status: string; timezone: string }) => void;
  creating: boolean;
  handleCreate: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          All Events
        </h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="text-xs font-medium text-green-700"
        >
          + New Event
        </button>
      </div>

      <div className="divide-y divide-gray-100">
        {events.map((event) => {
          const isActive = event.id === activeId;
          return (
            <div key={event.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">{event.trip_name}</p>
                <span
                  className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? "text-green-700 bg-green-50"
                      : "text-gray-500 bg-gray-100"
                  }`}
                >
                  {isActive ? "Active" : "Archived"}
                </span>
              </div>
              <div className="flex gap-2">
                {isActive && onArchive ? (
                  <button
                    onClick={onArchive}
                    className="text-xs text-amber-600 font-medium"
                  >
                    Archive
                  </button>
                ) : !isActive ? (
                  <button
                    onClick={() => onSetActive(event.id)}
                    className="text-xs text-green-700 font-medium"
                  >
                    Set Active
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}

        {events.length === 0 && !showCreate && (
          <p className="px-4 py-4 text-sm text-gray-400 text-center">No events yet</p>
        )}
      </div>

      {showCreate && (
        <div className="px-4 py-4 bg-green-50 border-t border-gray-200 space-y-3">
          <input
            type="text"
            placeholder="Event name (e.g. Golfapalooza 2025)"
            autoFocus
            value={newTrip.trip_name}
            onChange={(e) => setNewTrip({ ...newTrip, trip_name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base bg-white"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start Date</label>
              <input
                type="date"
                value={newTrip.start_date}
                onChange={(e) => setNewTrip({ ...newTrip, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base bg-white"
                style={{ backgroundColor: "white" }}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End Date</label>
              <input
                type="date"
                value={newTrip.end_date}
                onChange={(e) => setNewTrip({ ...newTrip, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base bg-white"
                style={{ backgroundColor: "white" }}
              />
            </div>
          </div>
          {newTrip.start_date && newTrip.end_date && (() => {
            const days = Math.floor((new Date(newTrip.end_date + "T00:00:00").getTime() - new Date(newTrip.start_date + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24)) + 1;
            return days > 0 ? (
              <p className="text-xs text-gray-500">{days} day{days !== 1 ? "s" : ""}</p>
            ) : null;
          })()}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select
              value={newTrip.status}
              onChange={(e) => setNewTrip({ ...newTrip, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base bg-white"
              style={{ backgroundColor: "white" }}
            >
              <option value="active">Active</option>
              <option value="archived">Archived (historical)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Timezone</label>
            <select
              value={newTrip.timezone}
              onChange={(e) => setNewTrip({ ...newTrip, timezone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base bg-white"
              style={{ backgroundColor: "white" }}
            >
              {US_TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !newTrip.trip_name || !newTrip.start_date || !newTrip.end_date}
              className="px-4 py-2 bg-green-700 text-white rounded-lg font-medium text-sm disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-gray-600 rounded-lg font-medium text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center px-4 py-3">
      <span className="text-sm text-gray-500 flex-shrink-0 mr-4">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}
