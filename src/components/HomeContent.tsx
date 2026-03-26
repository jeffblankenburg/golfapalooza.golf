"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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


function getCountdown(startDate: string) {
  const [year, month, day] = startDate.split("-").map(Number);
  const tripDate = new Date(year, month - 1, day);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
}: {
  displayName: string;
  trip: TripData | null;
  incompleteActionCount: number;
  totalActionCount: number;
  rsvpLikelihood: number | null;
  myRoomNumber?: string | null;
  myFacilityName?: string | null;
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

  useEffect(() => {
    if (trip?.start_date) {
      setDaysLeft(getCountdown(trip.start_date));
    }
  }, [trip?.start_date]);

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
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Hey, {displayName}
        </h1>
        <p className="text-gray-500 mt-1">Welcome back, Loozer.</p>
      </div>

      {/* RSVP Button */}
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

      {/* Countdown Card */}
      {trip && daysLeft !== null && (
        <div className="bg-white rounded-2xl p-6 border-2 border-green-600 shadow-sm">
          <p className="text-green-600 text-sm font-medium uppercase tracking-wide">
            {trip.trip_name}
          </p>
          {daysLeft > 0 ? (
            <>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-5xl font-bold text-green-700">{daysLeft}</span>
                <span className="text-xl text-green-600">
                  {daysLeft === 1 ? "day" : "days"} to go
                </span>
              </div>
              {trip.location && (
                <p className="text-green-600/70 mt-2 text-sm">{trip.location}</p>
              )}
            </>
          ) : daysLeft === 0 ? (
            <p className="text-3xl font-bold mt-2 text-green-700">It&apos;s go time!</p>
          ) : (
            <p className="text-xl font-semibold mt-2 text-green-600">
              Trip completed
            </p>
          )}
        </div>
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
