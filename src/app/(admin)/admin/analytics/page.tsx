"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BottomDrawer } from "@/components/admin/BottomDrawer";

interface UserRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  last_active: string | null;
}

interface DailyRow {
  day: string;
  users: number;
  page_views: number;
  logins: number;
  chat_messages: number;
  score_saves: number;
  gallery_uploads: number;
  notification_clicks: number;
  errors: number;
  song_plays: number;
}

interface OverviewData {
  window_days: number;
  daily: DailyRow[];
  totals: {
    users: number;
    page_views: number;
    logins: number;
    chat_messages: number;
    score_saves: number;
    gallery_uploads: number;
    notification_clicks: number;
    errors: number;
    song_plays: number;
    eligible_users: number;
  };
  users_breakdown: LoozerStatsRow[];
  no_pwa: UserRow[];
  inactive: UserRow[];
}

interface LoozerStatsRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  events: number;
  page_views: number;
  chat_messages: number;
  gallery_uploads: number;
  song_plays: number;
  last_seen: string | null;
}

type SortKey = "page_views" | "chat_messages" | "gallery_uploads" | "song_plays";
type SortDir = "asc" | "desc";
interface SortState {
  key: SortKey;
  dir: SortDir;
}

interface DayDetailUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
  events: number;
  page_views: number;
  chat_messages: number;
  score_saves: number;
  gallery_uploads: number;
  song_plays: number;
  last_seen: string | null;
}

interface DayDetail {
  day: string;
  metrics: {
    users: number;
    page_views: number;
    logins: number;
    chat_messages: number;
    score_saves: number;
    gallery_uploads: number;
    notification_clicks: number;
    errors: number;
    song_plays: number;
  };
  active_users: DayDetailUser[];
  top_pages: { page_path: string; views: number }[];
}

const ALL_TIME_DAYS = 99999;
const WINDOW_OPTIONS: { value: WindowSetting; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
  { value: "all", label: "All Time" },
];
type WindowSetting = 7 | 14 | 30 | "all";
type WindowDays = 7 | 14 | 30;
function settingToDays(s: WindowSetting): number {
  return s === "all" ? ALL_TIME_DAYS : s;
}
function settingLabel(s: WindowSetting): string {
  return s === "all" ? "all time" : `last ${s} days`;
}

type MetricKey =
  | "users"
  | "page_views"
  | "logins"
  | "chat_messages"
  | "score_saves"
  | "gallery_uploads"
  | "errors"
  | "song_plays";

const METRIC_DEFS: { key: MetricKey; label: string; color: string }[] = [
  { key: "users", label: "Users", color: "bg-green-500" },
  { key: "page_views", label: "Pages", color: "bg-indigo-500" },
  // Logins hidden by request — data still flows from the SQL function and the day drawer.
  // { key: "logins", label: "Logins", color: "bg-blue-500" },
  { key: "chat_messages", label: "Chats", color: "bg-fuchsia-500" },
  // Scores temporarily hidden — score_save events fire on every autosave, not per round, so the
  // count is misleading. Day drawer still shows it for diagnostics.
  // { key: "score_saves", label: "Scores", color: "bg-emerald-500" },
  { key: "gallery_uploads", label: "Photos", color: "bg-pink-500" },
  { key: "song_plays", label: "Songs", color: "bg-amber-500" },
  // Errors hidden by request — data still flows from the SQL function and the day drawer.
  // { key: "errors", label: "Errors", color: "bg-red-500" },
];

export default function AnalyticsOverviewPage() {
  const router = useRouter();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [windowSetting, setWindowSetting] = useState<WindowSetting>(7);
  const [chartMetric, setChartMetric] = useState<MetricKey>("users");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [windowSort, setWindowSort] = useState<SortState>({ key: "page_views", dir: "desc" });
  const [daySort, setDaySort] = useState<SortState>({ key: "page_views", dir: "desc" });
  const [pwaOpen, setPwaOpen] = useState(false);
  const [inactiveOpen, setInactiveOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/analytics-overview?days=${settingToDays(windowSetting)}`);
    if (res.status === 401 || res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [windowSetting]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openDay = useCallback(async (day: string) => {
    setSelectedDay(day);
    setDayDetail(null);
    setDayLoading(true);
    const res = await fetch(`/api/admin/analytics-overview/day?date=${day}`);
    if (res.ok) {
      setDayDetail(await res.json());
    }
    setDayLoading(false);
  }, []);

  if (forbidden) {
    router.push("/admin");
    return null;
  }

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <button
          onClick={() => router.push("/admin")}
          className="text-sm text-gray-500 active:text-gray-700"
        >
          Back
        </button>
      </div>

      <WindowSelector value={windowSetting} onChange={setWindowSetting} />

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <>
          {/* Activity (today/7d/30d) section consolidated into the window-scoped totals below.
          <section className="space-y-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Activity
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Today" users={0} views={0} />
            </div>
          </section> */}

          <section className="space-y-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {windowSetting === "all" ? "All time totals" : `Last ${windowSetting} days totals`}
            </h2>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Active Users" value={data.totals.users} color="text-green-600" />
              <MiniStat label="Page Views" value={data.totals.page_views} color="text-indigo-600" />
              <MiniStat label="Messages" value={data.totals.chat_messages} color="text-fuchsia-600" />
              <MiniStat label="Photo Uploads" value={data.totals.gallery_uploads} color="text-pink-600" />
              <MiniStat label="Song Plays" value={data.totals.song_plays} color="text-amber-600" />
              {/* Logins / Scores / Notif Taps / Errors hidden by request — data still flows
              from the SQL function and the day drawer.
              <MiniStat label="Logins" value={data.totals.logins} color="text-blue-600" />
              <MiniStat label="Scores" value={data.totals.score_saves} color="text-emerald-600" />
              <MiniStat label="Notif Taps" value={data.totals.notification_clicks} color="text-amber-600" />
              <MiniStat
                label="Errors"
                value={data.totals.errors}
                color={data.totals.errors > 0 ? "text-red-600" : "text-gray-400"}
              /> */}
            </div>
          </section>

          <DailyChart
            daily={data.daily}
            windowSetting={windowSetting}
            metric={chartMetric}
            onMetricChange={setChartMetric}
            onBarTap={openDay}
          />

          {(() => {
            const breakdown = data.users_breakdown ?? [];
            return (
              <section className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-900">
                    Active Loozers ({settingLabel(windowSetting)})
                  </h2>
                  <span className="text-xs text-gray-500">{breakdown.length}</span>
                </div>
                <LoozerStatsTable
                  rows={breakdown}
                  sort={windowSort}
                  onSortChange={setWindowSort}
                  emptyText="No activity in this window."
                />
              </section>
            );
          })()}

          {(() => {
            const inactiveIds = new Set(data.inactive.map((u) => u.id));
            const visibleNoPwa = data.no_pwa.filter((u) => !inactiveIds.has(u.id));
            return (
              <CollapsibleSection
                title="Haven't installed the app"
                summary={`${data.totals.eligible_users - data.no_pwa.length}/${data.totals.eligible_users} installed · ${visibleNoPwa.length} to remind`}
                open={pwaOpen}
                onToggle={() => setPwaOpen((v) => !v)}
              >
                <p className="text-xs text-gray-500 mb-3">
                  Active Loozers who&apos;ve only opened the site in a browser tab. They&apos;re missing push notifications and the home-screen icon. (Inactive Loozers are listed separately below.)
                </p>
                <UserList rows={visibleNoPwa} emptyText="Everyone active has installed the app." />
              </CollapsibleSection>
            );
          })()}

          <CollapsibleSection
            title="Inactive Loozers"
            summary={
              windowSetting === "all"
                ? `${data.inactive.length} have never visited`
                : `${data.inactive.length} haven't visited in ${windowSetting} days`
            }
            open={inactiveOpen}
            onToggle={() => setInactiveOpen((v) => !v)}
          >
            {loading ? (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <UserList
                rows={data.inactive}
                emptyText={
                  windowSetting === "all"
                    ? "Every Loozer has visited at least once."
                    : `No Loozers inactive for ${windowSetting}+ days.`
                }
                showLastActive
              />
            )}
          </CollapsibleSection>
        </>
      ) : null}

      <BottomDrawer
        open={selectedDay !== null}
        onClose={() => {
          setSelectedDay(null);
          setDayDetail(null);
        }}
        title={selectedDay ? formatLongDate(selectedDay) : ""}
        subtitle={
          dayDetail
            ? `${dayDetail.metrics.users} ${dayDetail.metrics.users === 1 ? "user" : "users"} · ${dayDetail.metrics.page_views} page views`
            : undefined
        }
      >
        <div className="px-6 py-4 space-y-5">
          {dayLoading || !dayDetail ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Active Users" value={dayDetail.metrics.users} color="text-green-600" />
                <MiniStat label="Page Views" value={dayDetail.metrics.page_views} color="text-indigo-600" />
                <MiniStat label="Messages" value={dayDetail.metrics.chat_messages} color="text-fuchsia-600" />
                <MiniStat label="Photo Uploads" value={dayDetail.metrics.gallery_uploads} color="text-pink-600" />
                <MiniStat label="Song Plays" value={dayDetail.metrics.song_plays} color="text-amber-600" />
                {/* Logins / Saves / Push Opens / Errors hidden — data still flows from the SQL function.
                <MiniStat label="Logins" value={dayDetail.metrics.logins} color="text-blue-600" />
                <MiniStat label="Saves" value={dayDetail.metrics.score_saves} color="text-emerald-600" />
                <MiniStat label="Push Opens" value={dayDetail.metrics.notification_clicks} color="text-amber-600" />
                <MiniStat
                  label="Errors"
                  value={dayDetail.metrics.errors}
                  color={dayDetail.metrics.errors > 0 ? "text-red-600" : "text-gray-400"}
                /> */}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Active Loozers ({dayDetail.active_users.length})
                </h3>
                <LoozerStatsTable
                  rows={dayDetail.active_users}
                  sort={daySort}
                  onSortChange={setDaySort}
                  emptyText="No activity recorded."
                />
              </div>

              {dayDetail.top_pages.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Top pages</h3>
                  <div className="space-y-2">
                    {dayDetail.top_pages.map((p) => {
                      const max = dayDetail.top_pages[0].views;
                      return (
                        <div key={p.page_path}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 font-mono truncate">{p.page_path}</span>
                            <span className="text-xs text-gray-500 ml-2 shrink-0">{p.views}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1">
                            <div
                              className="bg-indigo-500 h-1 rounded-full"
                              style={{ width: `${(p.views / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </BottomDrawer>
    </div>
  );
}

function WindowSelector({
  value,
  onChange,
}: {
  value: WindowSetting;
  onChange: (v: WindowSetting) => void;
}) {
  return (
    <div className="flex gap-2">
      {WINDOW_OPTIONS.map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 py-2 text-sm font-semibold rounded-xl transition-colors ${
            value === opt.value
              ? "bg-green-600 text-white"
              : "bg-white text-gray-600 border border-gray-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Activity-section card. Intentionally retained for future reuse even though the section
// using it is now commented out.
function StatCard({ label, users, views }: { label: string; users: number; views: number }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-gray-900">{users}</span>
        <span className="text-xs text-gray-500">{users === 1 ? "user" : "users"}</span>
      </div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-sm font-semibold text-gray-700">{views}</span>
        <span className="text-xs text-gray-500">page views</span>
      </div>
    </div>
  );
}
void StatCard;

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[0.625rem] text-gray-500">{label}</p>
    </div>
  );
}

function StatCell({ value, color }: { value: number; color: string }) {
  return (
    <span
      className={`w-12 shrink-0 text-center text-sm font-semibold tabular-nums ${
        value > 0 ? color : "text-gray-300"
      }`}
    >
      {value}
    </span>
  );
}

const SORT_COLUMNS: { key: SortKey; label: string; color: string }[] = [
  { key: "page_views", label: "Pages", color: "text-indigo-600" },
  { key: "chat_messages", label: "Msgs", color: "text-fuchsia-600" },
  { key: "gallery_uploads", label: "Photos", color: "text-pink-600" },
  { key: "song_plays", label: "Songs", color: "text-amber-600" },
];

function LoozerStatsTable({
  rows,
  sort,
  onSortChange,
  emptyText,
}: {
  rows: { id: string; display_name: string; avatar_url: string | null; page_views: number; chat_messages: number; gallery_uploads: number; song_plays: number }[];
  sort: SortState;
  onSortChange: (s: SortState) => void;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 py-3 text-center">{emptyText}</p>;
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    if (av === bv) return a.display_name.localeCompare(b.display_name);
    return sort.dir === "desc" ? bv - av : av - bv;
  });

  const handleSort = (key: SortKey) => {
    if (sort.key === key) {
      onSortChange({ key, dir: sort.dir === "desc" ? "asc" : "desc" });
    } else {
      onSortChange({ key, dir: "desc" });
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 px-2 pb-1.5 text-[0.625rem] font-semibold text-gray-500 uppercase tracking-wide">
        <div className="w-8 shrink-0" />
        <div className="flex-1" />
        {SORT_COLUMNS.map((c) => {
          const active = sort.key === c.key;
          return (
            <button
              key={c.key}
              onClick={() => handleSort(c.key)}
              className={`w-12 shrink-0 text-center flex items-center justify-center gap-0.5 ${
                active ? "text-gray-900" : "text-gray-500"
              }`}
            >
              <span>{c.label}</span>
              {active && (
                <span className="text-[0.5rem]">{sort.dir === "desc" ? "▼" : "▲"}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="space-y-1.5">
        {sorted.map((u) => (
          <div
            key={u.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-gray-50"
          >
            {u.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={u.avatar_url}
                alt=""
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-gray-500">
                  {u.display_name?.[0]?.toUpperCase() || "?"}
                </span>
              </div>
            )}
            <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
              {u.display_name}
            </p>
            <StatCell value={u.page_views} color="text-indigo-600" />
            <StatCell value={u.chat_messages} color="text-fuchsia-600" />
            <StatCell value={u.gallery_uploads} color="text-pink-600" />
            <StatCell value={u.song_plays} color="text-amber-600" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left active:bg-gray-50"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-500 truncate">{summary}</p>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 -mt-1">{children}</div>}
    </section>
  );
}

function DailyChart({
  daily,
  windowSetting,
  metric,
  onMetricChange,
  onBarTap,
}: {
  daily: DailyRow[];
  windowSetting: WindowSetting;
  metric: MetricKey;
  onMetricChange: (m: MetricKey) => void;
  onBarTap: (day: string) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lookup = new Map(daily.map((d) => [d.day, d]));
  const days: DailyRow[] = [];

  // For fixed windows render N contiguous days. For "all time", render from the
  // earliest day with activity through today so missing days appear as zero.
  let startOffset: number;
  if (windowSetting === "all") {
    if (daily.length === 0) {
      startOffset = 0;
    } else {
      const earliest = daily
        .map((d) => new Date(d.day + "T00:00:00").getTime())
        .reduce((a, b) => Math.min(a, b));
      const ms = today.getTime() - earliest;
      startOffset = Math.max(0, Math.floor(ms / 86400000));
    }
  } else {
    startOffset = windowSetting - 1;
  }

  for (let i = startOffset; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const found = lookup.get(key);
    days.push(
      found ?? {
        day: key,
        users: 0,
        page_views: 0,
        logins: 0,
        chat_messages: 0,
        score_saves: 0,
        gallery_uploads: 0,
        notification_clicks: 0,
        errors: 0,
        song_plays: 0,
      },
    );
  }

  const def = METRIC_DEFS.find((m) => m.key === metric)!;
  const max = Math.max(1, ...days.map((d) => d[metric]));
  const headerLabel =
    windowSetting === "all" ? "All time" : `Last ${windowSetting} days`;

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-gray-900">{headerLabel}</h2>
        <span className="text-xs text-gray-400">peak {max}</span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {METRIC_DEFS.map((m) => (
          <button
            key={m.key}
            onClick={() => onMetricChange(m.key)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
              metric === m.key
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 border border-gray-200"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-1">Tap a day for details</p>
        <div className="flex items-end gap-px h-24">
          {days.map((d) => {
            const value = d[metric];
            const pct = (value / max) * 100;
            return (
              <button
                key={d.day}
                onClick={() => onBarTap(d.day)}
                className="flex-1 flex flex-col justify-end h-full group"
                title={`${d.day}: ${value} ${def.label.toLowerCase()}`}
              >
                <div
                  className={`w-full ${def.color} rounded-t group-active:opacity-70 transition-opacity`}
                  style={{
                    height: `${Math.max(pct, value > 0 ? 6 : 2)}%`,
                    opacity: value > 0 ? 1 : 0.2,
                  }}
                />
              </button>
            );
          })}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[0.625rem] text-gray-400">{formatShortDate(days[0].day)}</span>
          <span className="text-[0.625rem] text-gray-400">{formatShortDate(days[days.length - 1].day)}</span>
        </div>
      </div>
    </section>
  );
}

function UserList({
  rows,
  emptyText,
  showLastActive,
}: {
  rows: UserRow[];
  emptyText: string;
  showLastActive?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 py-3 text-center">{emptyText}</p>;
  }
  return (
    <div className="space-y-1.5">
      {rows.map((u) => (
        <div
          key={u.id}
          className="flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-gray-50"
        >
          {u.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={u.avatar_url}
              alt=""
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-gray-500">
                {u.display_name?.[0]?.toUpperCase() || "?"}
              </span>
            </div>
          )}
          <span className="text-sm font-medium text-gray-900 flex-1 truncate">
            {u.display_name}
          </span>
          {showLastActive && (
            <span className="text-xs text-gray-400 shrink-0">
              {u.last_active ? formatRelative(u.last_active) : "never"}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function formatShortDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatLongDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeOnly(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const d = Math.floor(hours / 24);
  if (d < 30) return `${d}d ago`;
  const months = Math.floor(d / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(d / 365);
  return `${years}y ago`;
}
