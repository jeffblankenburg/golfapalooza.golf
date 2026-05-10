"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SimulatorBanner({
  simDate,
  simUserName,
  simTripActive = false,
}: {
  simDate: string | null;
  simUserName: string | null;
  simTripActive?: boolean;
}) {
  const router = useRouter();
  const [clearing, setClearing] = useState<"date" | "user" | "trip" | null>(null);

  async function clearSim(type: "date" | "user" | "trip") {
    setClearing(type);
    await fetch("/api/admin/simulator", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clearDate: type === "date",
        clearUser: type === "user",
        clearTrip: type === "trip",
      }),
    });
    router.refresh();
    setClearing(null);
  }

  function formatDate(dateStr: string): string {
    let datePart = dateStr;
    let timePart: string | null = null;
    if (dateStr.includes("T")) {
      [datePart, timePart] = dateStr.split("T");
    }
    const [y, m, d] = datePart.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const dateLabel = date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    if (timePart) {
      const [h, min] = timePart.split(":").map(Number);
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${dateLabel} ${h12}:${String(min).padStart(2, "0")} ${ampm}`;
    }
    return dateLabel;
  }

  return (
    <>
      {simTripActive && (
        <div className="bg-emerald-100 border-b border-emerald-300 px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span aria-hidden>🧪</span>
            <span className="text-emerald-900 font-bold uppercase tracking-wide">
              Sim Mode
            </span>
            <span className="text-emerald-800 truncate">
              — viewing test event, not real data
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => clearSim("trip")}
              disabled={clearing === "trip"}
              className="text-emerald-700 hover:text-emerald-900 text-xs font-medium border border-emerald-300 rounded px-2 py-0.5"
            >
              Exit
            </button>
          </div>
        </div>
      )}
      {(simDate || simUserName) && (
    <div className="bg-amber-100 border-b border-amber-300 px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {simDate && (
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-amber-800 font-medium truncate">{formatDate(simDate)}</span>
            <button
              onClick={() => clearSim("date")}
              disabled={clearing === "date"}
              className="text-amber-600 hover:text-amber-800 p-0.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {simDate && simUserName && (
          <span className="text-amber-400">|</span>
        )}
        {simUserName && (
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-amber-800 font-medium truncate">Viewing as {simUserName}</span>
            <button
              onClick={() => clearSim("user")}
              disabled={clearing === "user"}
              className="text-amber-600 hover:text-amber-800 p-0.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
      <a
        href="/admin/simulator"
        className="text-amber-600 hover:text-amber-800 flex-shrink-0 p-0.5"
        title="Simulator Settings"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </a>
    </div>
      )}
    </>
  );
}
