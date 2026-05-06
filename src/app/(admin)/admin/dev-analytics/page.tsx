"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

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
  score_saves: number;
  chat_messages: number;
  gallery_uploads: number;
  notification_clicks: number;
  errors: number;
  pickem_picks: number;
  event_breakdown: { event_type: string; total: number }[];
  top_pages: { page_path: string; views: number }[];
  active_users: { display_name: string; user_id: string; events: number; last_active: string }[];
  daily_activity: { day: string; events: number }[];
  hourly_activity: { hour: number; events: number }[];
  device_breakdown: { device: string; users: number }[];
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  login: "bg-blue-100 text-blue-700",
  page_view: "bg-gray-100 text-gray-600",
  score_save: "bg-green-100 text-green-700",
  chat_message: "bg-indigo-100 text-indigo-700",
  chat_open: "bg-indigo-50 text-indigo-600",
  gallery_upload: "bg-pink-100 text-pink-700",
  notification_click: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
  pickem_pick: "bg-orange-100 text-orange-700",
  option_selection: "bg-teal-100 text-teal-700",
  leaderboard_view: "bg-emerald-100 text-emerald-700",
};

const ALL_EVENT_TYPES = [
  "", "login", "page_view", "score_save", "chat_message", "chat_open",
  "gallery_upload", "notification_click", "error", "pickem_pick",
  "option_selection", "leaderboard_view",
];

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
    const d = Math.floor(hours / 24);
    return `${d}d ago`;
  };

  const eventTypeBadge = (type: string) =>
    EVENT_TYPE_COLORS[type] || "bg-purple-100 text-purple-700";

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
          {/* Summary cards — row 1 */}
          {stats && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                  <p className="text-2xl font-bold text-gray-900">{stats.total_events}</p>
                  <p className="text-xs text-gray-500">Total Events</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                  <p className="text-2xl font-bold text-gray-900">{stats.unique_users}</p>
                  <p className="text-xs text-gray-500">Unique Users</p>
                </div>
              </div>

              {/* Summary cards — row 2: feature breakdown */}
              <div className="grid grid-cols-3 gap-2">
                <StatMini label="Logins" value={stats.logins} color="text-blue-600" />
                <StatMini label="Page Views" value={stats.page_views} color="text-gray-600" />
                <StatMini label="Scores" value={stats.score_saves} color="text-green-600" />
                <StatMini label="Chat Msgs" value={stats.chat_messages} color="text-indigo-600" />
                <StatMini label="Uploads" value={stats.gallery_uploads} color="text-pink-600" />
                <StatMini label="Notif Taps" value={stats.notification_clicks} color="text-amber-600" />
                <StatMini label="Pick'em" value={stats.pickem_picks} color="text-orange-600" />
                <StatMini label="Errors" value={stats.errors} color={stats.errors > 0 ? "text-red-600" : "text-gray-400"} />
              </div>
            </>
          )}

          {/* Device breakdown */}
          {stats?.device_breakdown && stats.device_breakdown.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Devices</h2>
              <div className="flex gap-3">
                {stats.device_breakdown.map((d) => (
                  <div key={d.device} className="flex-1 text-center">
                    <p className="text-lg font-bold text-gray-900">{d.users}</p>
                    <p className="text-xs text-gray-500">{d.device}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daily activity sparkline */}
          {stats?.daily_activity && stats.daily_activity.length > 1 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Daily Activity</h2>
              <div className="flex items-end gap-1 h-20">
                {stats.daily_activity.map((d) => {
                  const max = Math.max(...stats.daily_activity.map((x) => x.events));
                  const pct = max > 0 ? (d.events / max) * 100 : 0;
                  return (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[9px] text-gray-400">{d.events}</span>
                      <div
                        className="w-full bg-green-500 rounded-t"
                        style={{ height: `${Math.max(pct, 4)}%` }}
                      />
                      <span className="text-[9px] text-gray-400">
                        {new Date(d.day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Hourly activity */}
          {stats?.hourly_activity && stats.hourly_activity.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Activity by Hour</h2>
              <div className="flex items-end gap-px h-16">
                {Array.from({ length: 24 }, (_, i) => {
                  const entry = stats.hourly_activity.find((h) => h.hour === i);
                  const events = entry?.events || 0;
                  const max = Math.max(...stats.hourly_activity.map((x) => x.events));
                  const pct = max > 0 ? (events / max) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div
                        className={`w-full rounded-t ${events > 0 ? "bg-indigo-400" : "bg-gray-100"}`}
                        style={{ height: `${Math.max(pct, 4)}%` }}
                        title={`${i}:00 — ${events} events`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-gray-400">12am</span>
                <span className="text-[9px] text-gray-400">6am</span>
                <span className="text-[9px] text-gray-400">12pm</span>
                <span className="text-[9px] text-gray-400">6pm</span>
                <span className="text-[9px] text-gray-400">12am</span>
              </div>
            </div>
          )}

          {/* Event type breakdown */}
          {stats?.event_breakdown && stats.event_breakdown.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Event Breakdown</h2>
              <div className="space-y-2">
                {stats.event_breakdown.map((e) => {
                  const maxTotal = stats.event_breakdown[0].total;
                  return (
                    <button
                      key={e.event_type}
                      onClick={() => setFilterType(filterType === e.event_type ? "" : e.event_type)}
                      className={`w-full text-left ${filterType === e.event_type ? "ring-2 ring-green-500 rounded-lg" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full ${eventTypeBadge(e.event_type)}`}>
                          {e.event_type}
                        </span>
                        <span className="text-xs text-gray-500">{e.total}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1">
                        <div
                          className="bg-green-500 h-1 rounded-full"
                          style={{ width: `${(e.total / maxTotal) * 100}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
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
            {ALL_EVENT_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(filterType === type ? "" : type)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filterType === type
                    ? "bg-green-600 text-white"
                    : "bg-white text-gray-600 border border-gray-200"
                }`}
              >
                {type || "All"}
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
              <div className="divide-y divide-gray-50 max-h-[32rem] overflow-y-auto">
                {events.map((event) => (
                  <div key={event.id} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {event.users?.display_name || "Unknown"}
                      </span>
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full ${eventTypeBadge(event.event_type)}`}>
                        {event.event_type}
                      </span>
                      <span className="text-xs text-gray-400 ml-auto shrink-0">{formatTime(event.created_at)}</span>
                    </div>
                    {event.page_path && (
                      <p className="text-xs text-gray-500 font-mono truncate mt-0.5">{event.page_path}</p>
                    )}
                    {event.event_type === "error" && event.metadata?.message ? (
                      <p className="text-xs text-red-500 mt-1 truncate">{String(event.metadata.message)}</p>
                    ) : null}
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

function StatMini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}
