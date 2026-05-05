"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { OptionBuilder } from "@/components/admin/OptionBuilder";
import { SelectionDashboard } from "@/components/admin/SelectionDashboard";
import { SelectionSummary } from "@/components/admin/SelectionSummary";
import { BTN_BACK } from "@/lib/ui/buttons";

export default function OptionsAdminPage() {
  const params = useParams();
  const tripId = params.tripId as string;
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"builder" | "selections" | "summary">("builder");
  const [selectionExporter, setSelectionExporter] = useState<(() => void) | null>(null);
  const handleExportReady = useCallback((exporter: (() => void) | null) => {
    setSelectionExporter(() => exporter);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        const user = data.user;
        if (!user) { router.replace("/admin"); return; }
        const ok = user.is_admin || user.permissions?.manage_options === true || user.permissions?.manage_finances === true;
        if (!ok) { router.replace(`/admin/events/${tripId}`); return; }
        setAllowed(true);
      })
      .catch(() => router.replace("/admin"));
  }, [router, tripId]);

  if (!allowed) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <Link href={`/admin/events/${tripId}`} className={BTN_BACK}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Event
      </Link>

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Trip Options</h1>
        {tab !== "builder" && (
          <button
            onClick={() => selectionExporter?.()}
            disabled={!selectionExporter}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl shadow-sm active:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download current selections as an Excel file"
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
                d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4"
              />
            </svg>
            Excel
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setTab("builder")}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
            tab === "builder"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500"
          }`}
        >
          Builder
        </button>
        <button
          onClick={() => setTab("selections")}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
            tab === "selections"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500"
          }`}
        >
          Selections
        </button>
        <button
          onClick={() => setTab("summary")}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
            tab === "summary"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500"
          }`}
        >
          Summary
        </button>
      </div>

      {tab === "builder" && <OptionBuilder tripId={tripId} />}
      {tab === "selections" && (
        <SelectionDashboard tripId={tripId} onExportReady={handleExportReady} />
      )}
      {tab === "summary" && (
        <SelectionSummary tripId={tripId} onExportReady={handleExportReady} />
      )}
    </div>
  );
}
