"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const DEV_USER_ID = "fd9c3a4b-e728-4e28-ac12-ed9099e389b5";

interface ActivityEvent {
  id: string;
  user_id: string;
  event_type: string;
  page_path: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  users: { display_name: string };
}

interface Stats {
  total_events: number;
  unique_users: number;
  logins: number;
  page_views: number;
  top_pages: { page_path: string; views: number }[];
  active_users: { display_name: string; user_id: string; events: number; last_active: string }[];
  daily_activity: { day: string; events: number }[];
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [days, setDays] = useState(7);
  const [filterType, setFilterType] = useState<string>("");
  const [filterUser, setFilterUser] = useState<string>("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ days: String(days) });
    if (filterType) params.set("event_type", filterType);
    if (filterUser) params.set("user_id", filterUser);

    const res = await fetch(`/api/activity?${params}`);
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setEvents(data.events || []);
    setStats(data.stats || null);
    setLoading(false);
  }, [days, filterType, filterUser]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (forbidden) {
    router.push("/admin");
    return null;
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const eventTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      login: "bg-blue-100 text-blue-700",
      page_view: "bg-gray-100 text-gray-600",
    };
    return colors[type] || "bg-purple-100 text-purple-700";
  };

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dev Analytics</h1>
        <button
          onClick={() => router.push("/admin")}
          className="text-sm text-gray-500 active:text-gray-700"
        >
          Back
        </button>
      </div>

      {/* Time range selector */}
      <div className="flex gap-2">
        {[1, 7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              days === d
                ? "bg-green-600 text-white"
                : "bg-white text-gray-600 border border-gray-200"
            }`}
          >
            {d === 1 ? "24h" : `${d}d`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {stats && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <p className="text-2xl font-bold text-gray-900">{stats.total_events}</p>
                <p className="text-xs text-gray-500">Total Events</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <p className="text-2xl font-bold text-gray-900">{stats.unique_users}</p>
                <p className="text-xs text-gray-500">Unique Users</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <p className="text-2xl font-bold text-blue-600">{stats.logins}</p>
                <p className="text-xs text-gray-500">Logins</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <p className="text-2xl font-bold text-gray-600">{stats.page_views}</p>
                <p className="text-xs text-gray-500">Page Views</p>
              </div>
            </div>
          )}

          {/* Top Pages */}
          {stats?.top_pages && stats.top_pages.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Top Pages</h2>
              <div className="space-y-2">
                {stats.top_pages.map((page) => {
                  const maxViews = stats.top_pages[0].views;
                  return (
                    <div key={page.page_path} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-700 truncate font-mono">
                            {page.page_path}
                          </span>
                          <span className="text-xs text-gray-500 ml-2 shrink-0">
                            {page.views}
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-green-500 h-1.5 rounded-full"
                            style={{ width: `${(page.views / maxViews) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active Users */}
          {stats?.active_users && stats.active_users.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Active Users</h2>
              <div className="space-y-2">
                {stats.active_users.map((u) => (
                  <button
                    key={u.user_id}
                    onClick={() => setFilterUser(filterUser === u.user_id ? "" : u.user_id)}
                    className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-left transition-colors ${
                      filterUser === u.user_id ? "bg-green-50 border border-green-200" : "hover:bg-gray-50"
                    }`}
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-900">{u.display_name}</span>
                      <span className="text-xs text-gray-400 ml-2">{formatRelative(u.last_active)}</span>
                    </div>
                    <span className="text-xs text-gray-500">{u.events} events</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Event type filter */}
          <div className="flex gap-2 flex-wrap">
            {["", "login", "page_view"].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filterType === type
                    ? "bg-green-600 text-white"
                    : "bg-white text-gray-600 border border-gray-200"
                }`}
              >
                {type || "All Events"}
              </button>
            ))}
            {filterUser && (
              <button
                onClick={() => setFilterUser("")}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 border border-red-200"
              >
                Clear User Filter
              </button>
            )}
          </div>

          {/* Event log */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">
                Recent Activity
                <span className="text-xs text-gray-400 font-normal ml-2">({events.length})</span>
              </h2>
            </div>
            {events.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-8">No activity found</div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {events.map((event) => (
                  <div key={event.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {event.users?.display_name || "Unknown"}
                        </span>
                        <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full ${eventTypeBadge(event.event_type)}`}>
                          {event.event_type}
                        </span>
                      </div>
                      {event.page_path && (
                        <p className="text-xs text-gray-500 font-mono truncate">{event.page_path}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{formatTime(event.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
