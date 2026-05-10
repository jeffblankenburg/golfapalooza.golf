"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { US_TIMEZONE_OPTIONS } from "@/lib/utils/timezone";
import { hasAnyEventPermission, hasAnyPermission } from "@/lib/permissions";

interface TripSummary {
  id: string;
  trip_name: string;
  trip_year: number;
  status: string;
}

interface UserAccess {
  id: string | null;
  isAdmin: boolean;
  permissions: Record<string, boolean> | null;
}

const DEV_USER_ID = "fd9c3a4b-e728-4e28-ac12-ed9099e389b5";

// Map card labels to the permission key required (if not is_admin)
const cardPermissionMap: Record<string, string> = {
  Loozers: "manage_loozers",
  Attendance: "manage_accolades",
  Facilities: "manage_facilities",
  Courses: "manage_facilities",
  Announcements: "send_announcements",
  Articles: "manage_notebook",
  Bios: "manage_bios",
  Gallery: "manage_gallery",
  Music: "manage_music",
  Nominations: "manage_loozers",
  "Fake Ads": "manage_fake_ads",
};

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
    href: "/admin/attendance",
    label: "Attendance",
    description: "Loozer × event matrix",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
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
    href: "/admin/articles",
    label: "Articles",
    description: "News & announcements",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    ),
  },
  {
    href: "/admin/polls",
    label: "Polls",
    description: "Ask Loozers questions",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21h18M7 21V11M12 21V7M17 21V14" />
      </svg>
    ),
  },
  {
    href: "/admin/bios",
    label: "Bios",
    description: "Loozer biographies",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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
    href: "/admin/music",
    label: "Music",
    description: "Songs & audio files",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
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
  {
    href: "/admin/nominations",
    label: "Nominations",
    description: "Review rookie nominations",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
      </svg>
    ),
  },
  {
    href: "/admin/fake-ads",
    label: "Fake Ads",
    description: "Humor banner ads",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
  },
  {
    href: "/admin/accolades",
    label: "Accolades",
    description: "Award names & icons",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
      </svg>
    ),
  },
];

export default function AdminPage() {
  const [events, setEvents] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<UserAccess>({ id: null, isAdmin: false, permissions: null });
  const [accessLoading, setAccessLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [pushTest, setPushTest] = useState<{ loading: boolean; result: null | { success: boolean; error?: string; diagnostics?: Record<string, unknown> } }>({ loading: false, result: null });
  const [newTrip, setNewTrip] = useState({
    trip_name: "",
    start_date: "",
    end_date: "",
    timezone: "America/New_York",
  });
  const [creating, setCreating] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    const res = await fetch("/api/admin/trips?status=all");
    const data = await res.json();
    if (data.trips) setEvents(data.trips);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Fetch user access level
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setAccess({
            id: data.user.id ?? null,
            isAdmin: data.user.is_admin ?? false,
            permissions: data.user.permissions ?? null,
          });
        }
        setAccessLoading(false);
      })
      .catch(() => setAccessLoading(false));

    fetchEvents();
  }, [fetchEvents]);

  // Filter data actions based on access
  const visibleActions = access.isAdmin
    ? dataActions
    : dataActions.filter((action) => {
        const requiredPerm = cardPermissionMap[action.label];
        return requiredPerm && access.permissions?.[requiredPerm] === true;
      });

  const handleDuplicate = useCallback(
    async (event: TripSummary) => {
      const nextYear = event.trip_year + 1;
      const today = new Date();
      const yyyy = nextYear;
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      if (!confirm(
        `Duplicate "${event.trip_name} ${event.trip_year}"?\n\nA new archived event will be created with the same contests, options, cost items, payouts, notebook, itinerary, and tee time slots — but no participants, scores, or selections.`,
      )) return;
      setDuplicating(event.id);
      const res = await fetch("/api/admin/trips/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_trip_id: event.id,
          trip_name: event.trip_name,
          trip_year: nextYear,
          start_date: `${yyyy}-${mm}-${dd}`,
          status: "archived",
        }),
      });
      const data = await res.json().catch(() => ({}));
      setDuplicating(null);
      if (!res.ok) {
        alert(data.error || "Failed to duplicate event");
        return;
      }
      await fetchEvents();
      if (data.warnings?.length > 0) {
        console.warn("[duplicate] warnings:", data.warnings);
      }
      alert(`Duplicated as archived event. Promote to Active when ready.`);
    },
    [fetchEvents],
  );

  const handleCreate = async () => {
    if (!newTrip.trip_name || !newTrip.start_date || !newTrip.end_date) return;
    setCreating(true);

    await fetch("/api/admin/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trip_name: newTrip.trip_name,
        start_date: newTrip.start_date,
        end_date: newTrip.end_date,
        timezone: newTrip.timezone,
      }),
    });

    await fetchEvents();
    setNewTrip({ trip_name: "", start_date: "", end_date: "", timezone: "America/New_York" });
    setShowCreate(false);
    setCreating(false);
  };

  const activeEvent = events.find((e) => e.status === "active");
  const testEvent = events.find((e) => e.status === "test");
  const pastEvents = events.filter((e) => e.status !== "active" && e.status !== "test");

  const statusStyles: Record<string, { border: string; badge: string; label: string }> = {
    active: {
      border: "border-green-600 border-2",
      badge: "bg-green-100 text-green-700",
      label: "Active",
    },
    test: {
      border: "border-emerald-500 border-2 border-dashed",
      badge: "bg-emerald-100 text-emerald-800",
      label: "TEST",
    },
    archived: {
      border: "border-gray-200",
      badge: "bg-gray-100 text-gray-500",
      label: "Archived",
    },
    draft: {
      border: "border-gray-200",
      badge: "bg-amber-100 text-amber-700",
      label: "Draft",
    },
  };

  const renderEventCard = (event: TripSummary) => {
    const s = statusStyles[event.status] ?? statusStyles.archived;
    const isDuplicating = duplicating === event.id;
    // Hidden for now — admin doesn't need duplication until after the
    // first real event runs. Re-enable by flipping back to
    // `event.status !== "test"`. The cloneTrip primitive + API endpoint
    // (#85) remain in place; only the UI button is hidden.
    const showDuplicate = false;
    return (
    <div
      key={event.id}
      className={`relative bg-white rounded-2xl border shadow-sm ${s.border}`}
    >
      <Link
        href={`/admin/events/${event.id}`}
        className="block p-4 active:scale-[0.98] transition-transform"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {event.trip_name} {event.trip_year}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${s.badge}`}
              >
                {s.label}
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
      {showDuplicate && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDuplicate(event);
          }}
          disabled={isDuplicating}
          className="absolute top-2 right-10 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide text-gray-600 bg-gray-50 border border-gray-200 active:bg-gray-100 disabled:opacity-50"
          title={`Duplicate "${event.trip_name} ${event.trip_year}" structure into a new archived event`}
        >
          {isDuplicating ? "…" : "Duplicate"}
        </button>
      )}
    </div>
    );
  };

  if (accessLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>

      {/* Active Event (top) — admin or any event permission */}
      {(access.isAdmin || hasAnyEventPermission(access.permissions)) && (loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activeEvent ? (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Active Event
          </h2>
          {renderEventCard(activeEvent)}
        </div>
      ) : null)}

      {/* Data Management */}
      {visibleActions.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Data Management
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {visibleActions.map((action) => (
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
      )}

      {/* Past Events — admin only */}
      {access.isAdmin && !loading && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {activeEvent ? "Past Events" : "Events"}
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newTrip.start_date}
                    onChange={(e) =>
                      setNewTrip({ ...newTrip, start_date: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">End Date</label>
                  <input
                    type="date"
                    value={newTrip.end_date}
                    onChange={(e) =>
                      setNewTrip({ ...newTrip, end_date: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
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
                <label className="block text-xs text-gray-500 mb-1">Timezone</label>
                <select
                  value={newTrip.timezone}
                  onChange={(e) =>
                    setNewTrip({ ...newTrip, timezone: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
                >
                  {US_TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!newTrip.trip_name || !newTrip.start_date || !newTrip.end_date || creating}
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

          <div className="space-y-3">
            {pastEvents.map(renderEventCard)}
            {pastEvents.length === 0 && !activeEvent && (
              <div className="text-center text-sm text-gray-400 py-8">
                No events yet. Create one to get started.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Test Event — full admins only */}
      {access.isAdmin && !loading && testEvent && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Test Event
          </h2>
          <p className="text-xs text-gray-500 mb-2">
            A structural mirror of the active event. Use this to verify
            scoring, payouts, leaderboards, and admin tools end-to-end
            after the active event has real attendees, without touching
            any real Loozer data. Manage sim mode + populate/wipe at{" "}
            <Link href="/admin/simulator" className="text-emerald-700 underline font-medium">
              /admin/simulator
            </Link>
            .
          </p>
          {renderEventCard(testEvent)}
        </div>
      )}

      {/* Analytics — any administrative access */}
      {(access.isAdmin || hasAnyPermission(access.permissions)) && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Analytics
          </h2>
          <Link
            href="/admin/analytics"
            className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-200 shadow-sm active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-blue-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Analytics</p>
                <p className="text-xs text-gray-500">Daily activity, app installs & inactive Loozers</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}

      {/* Dev Analytics — dev only */}
      {access.id === DEV_USER_ID && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Developer
          </h2>
          <Link
            href="/admin/dev-analytics"
            className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-200 shadow-sm active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-50 text-purple-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Dev Analytics</p>
                <p className="text-xs text-gray-500">User activity & page views</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}

      {/* Diagnostics — admin only */}
      {access.isAdmin && <div>
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
      </div>}
    </div>
  );
}
