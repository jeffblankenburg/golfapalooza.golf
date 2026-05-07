"use client";

import { useEffect, useMemo, useState } from "react";

interface SkippedRow {
  year: number;
  workbookName: string;
  reason: string;
}

interface ImportResult {
  apply: boolean;
  plannedInserts: number;
  inserted: number;
  alreadyPresent: number;
  skipped: SkippedRow[];
  errors: Array<{ error: string }>;
  totalAttendanceInWorkbook: number;
  matchedUserCount: number;
}

export function HistoryAttendanceImporter() {
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [running, setRunning] = useState(false);
  const [lastApplied, setLastApplied] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/history/import-attendance");
        const text = await res.text();
        if (cancelled) return;
        if (!res.ok) {
          setError(`GET ${res.status}: ${text.slice(0, 500)}`);
          return;
        }
        try {
          setPreview(JSON.parse(text));
        } catch {
          setError(`Non-JSON response: ${text.slice(0, 500)}`);
        }
      } catch (e) {
        if (!cancelled) setError(`Fetch failed: ${(e as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshPreview = async () => {
    const res = await fetch("/api/admin/history/import-attendance");
    setPreview(await res.json());
  };

  const runImport = async () => {
    setRunning(true);
    setLastApplied(null);
    const res = await fetch("/api/admin/history/import-attendance", { method: "POST" });
    const data = (await res.json()) as ImportResult;
    setLastApplied(data);
    setRunning(false);
    await refreshPreview();
  };

  const skippedByReason = useMemo(() => {
    const m = new Map<string, SkippedRow[]>();
    for (const s of preview?.skipped ?? []) {
      const arr = m.get(s.reason) ?? [];
      arr.push(s);
      m.set(s.reason, arr);
    }
    return m;
  }, [preview]);

  const unmatched = useMemo(() => {
    const set = new Set<string>();
    for (const s of preview?.skipped ?? []) {
      if (s.reason === "workbook_name not matched to a user") set.add(s.workbookName);
    }
    return [...set].sort();
  }, [preview]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-800">
        <p className="font-semibold mb-2">Preview failed to load</p>
        <pre className="text-xs whitespace-pre-wrap">{error}</pre>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="In workbook" value={preview.totalAttendanceInWorkbook} />
          <Stat
            label="Ready to import"
            value={preview.plannedInserts}
            tone={preview.plannedInserts > 0 ? "green" : "gray"}
          />
          <Stat
            label="Skipped"
            value={preview.skipped.length}
            tone={preview.skipped.length > 0 ? "amber" : "gray"}
          />
        </div>
        <div className="text-xs text-gray-500 text-center">
          {preview.alreadyPresent} already in DB · {preview.matchedUserCount} matched users
        </div>
        <div className="flex justify-center">
          <button
            onClick={runImport}
            disabled={running || preview.plannedInserts === 0}
            className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform"
          >
            {running
              ? "Importing…"
              : preview.plannedInserts === 0
                ? "Nothing new to import"
                : `Import ${preview.plannedInserts} attendance rows`}
          </button>
        </div>
      </div>

      {lastApplied && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-sm">
          <p className="font-semibold text-green-900">Import complete</p>
          <p className="text-green-800 mt-1">
            Inserted {lastApplied.inserted} new attendance rows.
            {lastApplied.errors.length > 0 ? ` ${lastApplied.errors.length} errors.` : ""}
          </p>
          {lastApplied.errors.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-red-700 cursor-pointer">Show errors</summary>
              <pre className="text-[11px] mt-2 whitespace-pre-wrap">
                {JSON.stringify(lastApplied.errors, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      {unmatched.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-sm font-semibold text-amber-900">
              {unmatched.length} unmatched Loozer{unmatched.length === 1 ? "" : "s"}
            </p>
            <a
              href="/admin/history/users?filter=unmatched"
              className="text-xs text-amber-700 underline"
            >
              Match Loozers →
            </a>
          </div>
          <p className="text-xs text-amber-800 mb-2">
            These workbook names aren&apos;t mapped to a user yet, so their attendance won&apos;t import. Match them and re-run.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unmatched.map((name) => (
              <span
                key={name}
                className="text-[11px] bg-white border border-amber-300 text-amber-800 rounded px-2 py-0.5"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {[...skippedByReason.entries()]
        .filter(([reason]) => reason !== "workbook_name not matched to a user")
        .map(([reason, rows]) => (
          <div key={reason} className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-sm font-semibold text-gray-900">
              {reason} ({rows.length})
            </p>
            <div className="text-xs text-gray-600 mt-1 space-y-0.5">
              {rows.slice(0, 10).map((r, i) => (
                <div key={i}>
                  {r.year} · {r.workbookName}
                </div>
              ))}
              {rows.length > 10 && (
                <div className="text-gray-400">… and {rows.length - 10} more</div>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "gray",
}: {
  label: string;
  value: number;
  tone?: "gray" | "green" | "amber";
}) {
  const colors = {
    gray: "text-gray-900",
    green: "text-green-700",
    amber: "text-amber-700",
  } as const;
  return (
    <div>
      <p className={`text-xl font-bold ${colors[tone]}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
    </div>
  );
}
