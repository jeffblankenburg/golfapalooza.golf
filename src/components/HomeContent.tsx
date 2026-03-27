"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { subscribeToPush } from "@/lib/notifications/push-client";
import { getTimezoneAbbreviation } from "@/lib/utils/timezone";

interface TripData {
  trip_name: string;
  trip_year: number;
  start_date: string;
  location: string | null;
}

const likelihoodOptions = [
  { value: 99, label: "Attending", description: "99% - I'll be there" },
  { value: 75, label: "Probable", description: "75% - Looking good" },
  { value: 50, label: "Questionable", description: "50% - Still figuring it out" },
  { value: 25, label: "Doubtful", description: "25% - Unlikely but possible" },
];


function getCountdown(startDate: string, simulatedDate: string | null) {
  const [year, month, day] = startDate.split("-").map(Number);
  const tripDate = new Date(year, month - 1, day);
  let today: Date;
  if (simulatedDate) {
    // Strip time portion if present (e.g. "2026-09-03T14:30" → "2026-09-03")
    const datePart = simulatedDate.includes("T") ? simulatedDate.split("T")[0] : simulatedDate;
    const [sy, sm, sd] = datePart.split("-").map(Number);
    today = new Date(sy, sm - 1, sd);
  } else {
    const now = new Date();
    today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const diffMs = tripDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

const quickLinks = [
  {
    href: "/chat",
    label: "Chat",
    color: "bg-blue-50 text-blue-700",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    href: "/schedule",
    label: "Schedule",
    color: "bg-green-50 text-green-700",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: "/course",
    label: "Course",
    color: "bg-emerald-50 text-emerald-700",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21V3l7 4 4-4 7 4v18l-7-4-4 4-7-4z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 3v18M14 3v18" />
      </svg>
    ),
  },
  {
    href: "/scores",
    label: "Scores",
    color: "bg-amber-50 text-amber-700",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    href: "/rooms",
    label: "Rooms",
    color: "bg-indigo-50 text-indigo-700",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    href: "/info",
    label: "Trip Info",
    color: "bg-purple-50 text-purple-700",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export function HomeContent({
  displayName,
  trip,
  incompleteActionCount = 0,
  totalActionCount = 0,
  rsvpLikelihood,
  myRoomNumber,
  myFacilityName,
  myTeeTime,
  myStartingHole,
  myTeammates,
  teeTimeDay,
  simulatedDate = null,
  participants = [],
  nextScheduleItem = null,
  timezone,
}: {
  displayName: string;
  trip: TripData | null;
  incompleteActionCount: number;
  totalActionCount: number;
  rsvpLikelihood: number | null;
  myRoomNumber?: string | null;
  myFacilityName?: string | null;
  myTeeTime?: string | null;
  myStartingHole?: number | null;
  myTeammates?: string[];
  teeTimeDay?: string | null;
  simulatedDate?: string | null;
  participants?: { likelihood: number; displayName: string }[];
  nextScheduleItem?: { title: string; location: string | null; time: string | null; dayLabel: string } | null;
  timezone?: string;
}) {
  const router = useRouter();
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedLikelihood, setSelectedLikelihood] = useState<number | null>(
    rsvpLikelihood
  );
  const [currentLikelihood, setCurrentLikelihood] = useState<number | null>(
    rsvpLikelihood
  );
  const [saving, setSaving] = useState(false);
  const [participantsExpanded, setParticipantsExpanded] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported" | "loading">("loading");
  const [pushRequesting, setPushRequesting] = useState(false);

  useEffect(() => {
    if (trip?.start_date) {
      setDaysLeft(getCountdown(trip.start_date, simulatedDate));
    }
  }, [trip?.start_date, simulatedDate]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushPermission(Notification.permission);
    } else {
      setPushPermission("unsupported");
    }
  }, []);

  const openModal = () => {
    setSelectedLikelihood(currentLikelihood || 99);
    setShowModal(true);
  };

  const confirmRsvp = async () => {
    if (!selectedLikelihood) return;
    setSaving(true);

    setCurrentLikelihood(selectedLikelihood);
    setShowModal(false);

    try {
      await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ likelihood: selectedLikelihood }),
      });
      router.refresh();
    } catch {
      setCurrentLikelihood(rsvpLikelihood);
    }

    setSaving(false);
  };

  const hasRsvpd = currentLikelihood !== null;

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      {/* Push Notification Permission Banner */}
      {pushPermission === "default" && (
        <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-sm flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm">Enable Notifications</p>
            <p className="text-xs text-gray-500 mt-0.5">Get alerts for announcements, tee times, and scores.</p>
          </div>
          <button
            onClick={async () => {
              setPushRequesting(true);
              const success = await subscribeToPush();
              if (success) {
                setPushPermission("granted");
              }
              setPushRequesting(false);
            }}
            disabled={pushRequesting}
            className="px-3 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg active:bg-green-700 flex-shrink-0 disabled:opacity-50"
          >
            {pushRequesting ? "..." : "Allow"}
          </button>
        </div>
      )}

      {/* Countdown Card */}
      {trip && daysLeft !== null && daysLeft > 0 && (
        <div className="bg-white rounded-2xl p-6 border-2 border-green-600 shadow-sm">
          <p className="text-green-600 text-sm font-medium uppercase tracking-wide">
            {trip.trip_name}
          </p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-5xl font-bold text-green-700">{daysLeft}</span>
            <span className="text-xl text-green-600">
              {daysLeft === 1 ? "day" : "days"} to go
            </span>
          </div>
          {trip.location && (
            <p className="text-green-600/70 mt-2 text-sm">{trip.location}</p>
          )}
        </div>
      )}

      {/* RSVP Button (not yet responded) */}
      {trip && !hasRsvpd && (
        <button
          onClick={openModal}
          className="w-full animate-rsvp-pulse rounded-2xl bg-green-600 py-6 px-6 shadow-lg shadow-green-600/25 active:scale-95 transition-transform"
        >
          <p className="text-white/80 text-sm font-medium mb-1">
            {trip.trip_name} {trip.trip_year}
          </p>
          <p className="text-white text-2xl font-extrabold tracking-tight">
            Are you in?
          </p>
          <p className="text-white/70 text-xs mt-1">
            Tap to set your status
          </p>
        </button>
      )}

      {/* Participants Card (after RSVP) */}
      {trip && hasRsvpd && participants.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center">
            <button
              onClick={() => setParticipantsExpanded(!participantsExpanded)}
              className="flex-1 flex items-center justify-between px-4 py-3 active:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="font-semibold text-gray-900">Participants</span>
                <span className="text-xs text-gray-400">({participants.length})</span>
              </div>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${participantsExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <button
              onClick={openModal}
              className="flex items-center gap-1.5 text-sm text-green-600 px-4 py-3 active:bg-gray-50 transition-colors border-l border-gray-100"
            >
              <span>{likelihoodOptions.find(o => o.value === currentLikelihood)?.label}</span>
              <span className="text-green-600/60">{currentLikelihood}%</span>
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
          {participantsExpanded && (
            <div className="border-t border-gray-100 px-4 py-3 space-y-3">
              {likelihoodOptions.map((option) => {
                const group = participants.filter(p => p.likelihood === option.value);
                if (group.length === 0) return null;
                return (
                  <div key={option.value}>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                      {option.label} ({group.length})
                    </p>
                    <p className="text-sm text-gray-700">
                      {group.map(p => p.displayName).join(", ")}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* My Tee Time Card */}
      {myTeeTime && (
        <Link
          href="/scores"
          className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-200 shadow-sm active:scale-95 transition-transform"
        >
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-50 text-green-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900">
              {new Date(`1970-01-01T${myTeeTime}`).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
              {timezone && (
                <span className="ml-1 text-xs font-normal text-gray-400">
                  {getTimezoneAbbreviation(timezone)}
                </span>
              )}
              {myStartingHole && (
                <span className="ml-2 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  Hole {myStartingHole}
                </span>
              )}
            </p>
            {myTeammates && myTeammates.length > 0 && (
              <p className="text-sm text-gray-500">{myTeammates.join(", ")}</p>
            )}
            {teeTimeDay && (
              <p className="text-xs text-gray-400 mt-0.5">{teeTimeDay}</p>
            )}
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
        </Link>
      )}

      {/* Up Next Card */}
      {nextScheduleItem && (
        <Link
          href="/schedule"
          className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-200 shadow-sm active:scale-95 transition-transform"
        >
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-50 text-green-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900">
              {nextScheduleItem.title}
              {nextScheduleItem.time && (
                <span className="ml-2 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  {new Date(`1970-01-01T${nextScheduleItem.time}`).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </p>
            {nextScheduleItem.location && (
              <p className="text-sm text-gray-500">{nextScheduleItem.location}</p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">{nextScheduleItem.dayLabel}</p>
          </div>
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {/* My Room Card */}
      {myRoomNumber && (
        <Link
          href="/rooms"
          className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-200 shadow-sm active:scale-95 transition-transform"
        >
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-indigo-50 text-indigo-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900">
              Room {myRoomNumber}
            </p>
            {myFacilityName && (
              <p className="text-sm text-gray-500">{myFacilityName}</p>
            )}
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
        </Link>
      )}

      {/* Action Items Card */}
      {totalActionCount > 0 && (
        <Link
          href="/actions"
          className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-200 shadow-sm active:scale-95 transition-transform"
        >
          <div
            className={`flex items-center justify-center w-12 h-12 rounded-full ${
              incompleteActionCount > 0
                ? "bg-red-50 text-red-600"
                : "bg-green-50 text-green-600"
            }`}
          >
            {incompleteActionCount > 0 ? (
              <span className="text-lg font-bold">{incompleteActionCount}</span>
            ) : (
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900">
              {incompleteActionCount > 0
                ? `${incompleteActionCount} thing${incompleteActionCount !== 1 ? "s" : ""} to do`
                : "All done!"}
            </p>
            <p className="text-sm text-gray-500">
              {incompleteActionCount > 0
                ? "Tap to see what's needed"
                : `${totalActionCount} item${totalActionCount !== 1 ? "s" : ""} completed`}
            </p>
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
        </Link>
      )}

      {/* Quick Links */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Quick Links
        </h2>
        <div className="flex flex-wrap justify-center gap-3">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex flex-col items-center p-4 bg-white rounded-2xl border border-gray-200 shadow-sm active:scale-95 transition-transform"
              style={{ width: "calc(33.333% - 8px)" }}
            >
              <div
                className={`flex items-center justify-center w-12 h-12 rounded-full ${link.color} mb-2`}
              >
                {link.icon}
              </div>
              <span className="text-sm font-semibold text-gray-900">
                {link.label}
              </span>
            </Link>
          ))}
        </div>
      </div>


      {/* RSVP Modal */}
      {showModal && (
        <div className="fixed top-14 bottom-16 left-0 right-0 z-35 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowModal(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-6 pb-6 animate-slide-up max-h-[calc(100%-12px)] overflow-y-auto">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-6" />
            <h2 className="text-xl font-bold text-gray-900 text-center mb-6">
              How likely are you?
            </h2>
            <div className="space-y-3">
              {likelihoodOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedLikelihood(option.value)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-colors text-left ${
                    selectedLikelihood === option.value
                      ? "border-green-600 bg-green-50"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedLikelihood === option.value
                        ? "border-green-600"
                        : "border-gray-300"
                    }`}
                  >
                    {selectedLikelihood === option.value && (
                      <div className="w-2.5 h-2.5 rounded-full bg-green-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">
                      {option.label}
                    </p>
                    <p className="text-sm text-gray-500">
                      {option.description}
                    </p>
                  </div>
                  <span className="text-lg font-bold text-gray-400">
                    {option.value}%
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={confirmRsvp}
              disabled={!selectedLikelihood || saving}
              className="w-full mt-6 bg-green-600 text-white font-semibold text-lg py-3.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
            >
              {saving ? "Saving..." : "Confirm"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
