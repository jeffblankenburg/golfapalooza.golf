"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface TripSummary {
  id: string;
  trip_name: string;
  trip_year: number;
  status: string;
}

const dataActions = [
  {
    href: "/admin/users",
    label: "Loozers",
    description: "Manage all players",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    href: "/admin/facilities",
    label: "Facilities",
    description: "Hotels, buildings & rooms",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    href: "/admin/courses",
    label: "Courses",
    description: "Golf courses & holes",
    icon: (
      <div
        className="w-8 h-8 bg-current"
        style={{
          WebkitMaskImage: "url(/noun-golf-flag-5010192.svg)",
          WebkitMaskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskImage: "url(/noun-golf-flag-5010192.svg)",
          maskSize: "contain",
          maskRepeat: "no-repeat",
          maskPosition: "center",
        }}
      />
    ),
  },
  {
    href: "/admin/announcements",
    label: "Announcements",
    description: "Send push notifications",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
  },
  {
    href: "/admin/gallery",
    label: "Gallery",
    description: "Manage images & videos",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    href: "/admin/simulator",
    label: "Simulator",
    description: "Time & user simulation",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
];

export default function AdminPage() {
  const [events, setEvents] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [pushTest, setPushTest] = useState<{ loading: boolean; result: null | { success: boolean; error?: string; diagnostics?: Record<string, unknown> } }>({ loading: false, result: null });
  const [newTrip, setNewTrip] = useState({
    trip_name: "",
    trip_year: "",
    start_date: "",
  });
  const [creating, setCreating] = useState(false);

  const fetchEvents = useCallback(async () => {
    const res = await fetch("/api/admin/trips?status=all");
    const data = await res.json();
    if (data.trips) setEvents(data.trips);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleCreate = async () => {
    if (!newTrip.trip_name || !newTrip.start_date) return;
    setCreating(true);

    await fetch("/api/admin/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trip_name: newTrip.trip_name,
        trip_year:
          newTrip.trip_year || new Date(newTrip.start_date).getFullYear(),
        start_date: newTrip.start_date,
      }),
    });

    await fetchEvents();
    setNewTrip({ trip_name: "", trip_year: "", start_date: "" });
    setShowCreate(false);
    setCreating(false);
  };

  return (
    <div className="px-4 pt-6 pb-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>

      {/* Data Management */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Data Management
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {dataActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-center text-center p-4 bg-white rounded-2xl border border-gray-200 shadow-sm active:scale-95 transition-transform"
            >
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-50 text-green-700 mb-2">
                {action.icon}
              </div>
              <span className="text-sm font-semibold text-gray-900">
                {action.label}
              </span>
              <span className="text-xs text-gray-500 mt-0.5">
                {action.description}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Diagnostics */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Diagnostics
        </h2>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Push Notifications</p>
              <p className="text-xs text-gray-500 mt-0.5">Send a test push to your device</p>
            </div>
            <button
              onClick={async () => {
                setPushTest({ loading: true, result: null });
                try {
                  const res = await fetch("/api/notifications/test-push", { method: "POST" });
                  const data = await res.json();
                  setPushTest({ loading: false, result: data });
                } catch {
                  setPushTest({ loading: false, result: { success: false, error: "Request failed" } });
                }
              }}
              disabled={pushTest.loading}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl disabled:opacity-50 active:scale-95 transition-transform"
            >
              {pushTest.loading ? "Sending..." : "Test Push"}
            </button>
          </div>
          {pushTest.result && (
            <div className={`mt-3 p-3 rounded-xl text-sm ${pushTest.result.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              <p className="font-medium">{pushTest.result.success ? "Push sent successfully!" : pushTest.result.error}</p>
              {pushTest.result.diagnostics && (
                <pre className="mt-2 text-xs whitespace-pre-wrap opacity-75">
                  {JSON.stringify(pushTest.result.diagnostics, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Events */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Events
          </h2>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="text-xs text-green-700 font-medium px-2 py-1 rounded-lg hover:bg-green-50"
          >
            + New Event
          </button>
        </div>

        {showCreate && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-3 space-y-2">
            <input
              type="text"
              placeholder="Event name (e.g. Golfapalooza)"
              autoFocus
              value={newTrip.trip_name}
              onChange={(e) =>
                setNewTrip({ ...newTrip, trip_name: e.target.value })
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
            />
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Year"
                value={newTrip.trip_year}
                onChange={(e) =>
                  setNewTrip({ ...newTrip, trip_year: e.target.value })
                }
                className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
              />
              <input
                type="date"
                value={newTrip.start_date}
                onChange={(e) =>
                  setNewTrip({ ...newTrip, start_date: e.target.value })
                }
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newTrip.trip_name || !newTrip.start_date || creating}
                className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Event"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 text-sm text-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/admin/events/${event.id}`}
                className={`block bg-white rounded-2xl border shadow-sm p-4 active:scale-[0.98] transition-transform ${
                  event.status === "active"
                    ? "border-green-600 border-2"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {event.trip_name} {event.trip_year}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                          event.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {event.status === "active" ? "Active" : "Archived"}
                      </span>
                    </div>
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </Link>
            ))}
            {events.length === 0 && (
              <div className="text-center text-sm text-gray-400 py-8">
                No events yet. Create one to get started.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
