"use client";

import { useEffect, useState } from "react";

interface Stats {
  scoring: {
    completed_rounds: number;
    best_gross: number | null;
    best_differential: number | null;
    scored_holes: number;
    eagles_or_better: number;
    birdies: number;
    pars: number;
    bogeys: number;
    doubles_or_worse: number;
  };
  accolades: {
    total: number;
    by_category: Record<string, number>;
  };
  engagement: {
    last_active: string | null;
    last_30_days: {
      page_views: number;
      chat_messages: number;
      gallery_uploads: number;
      score_saves: number;
      song_plays: number;
    };
    song_plays_all_time: number;
  };
}

function pct(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function StatRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-900">
        {value}
        {sub != null && <span className="ml-1.5 text-[0.6875rem] font-normal text-gray-400">{sub}</span>}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">{title}</h3>
      <div className="bg-white border border-gray-200 rounded-xl px-3 py-1">{children}</div>
    </div>
  );
}

export function UserStatsTab({ userId }: { userId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/users/${userId}/stats`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) {
          setError(d.error || "Failed to load stats");
          return;
        }
        setStats(d);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load stats");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!stats && !error) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) return <p className="text-sm text-red-600 py-4">{error}</p>;
  if (!stats) return null;

  const s = stats.scoring;
  const e = stats.engagement.last_30_days;
  const lastActive = stats.engagement.last_active
    ? new Date(stats.engagement.last_active).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Never";

  const categoryLabels: Record<string, string> = {
    mvl: "MVL",
    roy: "Rookie of the Year",
    melc: "Melc",
    bspitw: "Best Shot in the World",
    green_jacket: "Green Jacket",
    cornhole_singles: "Cornhole Singles",
    cornhole_doubles: "Cornhole Doubles",
    custom: "Custom",
  };

  return (
    <div className="space-y-4">
      <Section title="Scoring">
        <StatRow label="Completed rounds" value={s.completed_rounds} />
        <StatRow label="Best gross" value={s.best_gross ?? "—"} />
        <StatRow
          label="Best differential"
          value={s.best_differential != null ? s.best_differential.toFixed(1) : "—"}
        />
        <StatRow label="Holes scored" value={s.scored_holes} />
        <StatRow label="Eagles+" value={s.eagles_or_better} sub={pct(s.eagles_or_better, s.scored_holes)} />
        <StatRow label="Birdies" value={s.birdies} sub={pct(s.birdies, s.scored_holes)} />
        <StatRow label="Pars" value={s.pars} sub={pct(s.pars, s.scored_holes)} />
        <StatRow label="Bogeys" value={s.bogeys} sub={pct(s.bogeys, s.scored_holes)} />
        <StatRow label="Doubles+" value={s.doubles_or_worse} sub={pct(s.doubles_or_worse, s.scored_holes)} />
      </Section>

      <Section title={`Accolades (${stats.accolades.total})`}>
        {stats.accolades.total === 0 ? (
          <p className="text-xs text-gray-400 italic py-2">None yet.</p>
        ) : (
          Object.entries(stats.accolades.by_category)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, count]) => (
              <StatRow key={cat} label={categoryLabels[cat] || cat} value={count} />
            ))
        )}
      </Section>

      <Section title="Engagement (last 30 days)">
        <StatRow label="Page views" value={e.page_views} />
        <StatRow label="Chat messages" value={e.chat_messages} />
        <StatRow label="Gallery uploads" value={e.gallery_uploads} />
        <StatRow label="Score saves" value={e.score_saves} />
        <StatRow label="Song plays" value={e.song_plays} />
        <StatRow label="Songs played (all time)" value={stats.engagement.song_plays_all_time} />
        <StatRow label="Last active" value={lastActive} />
      </Section>
    </div>
  );
}
