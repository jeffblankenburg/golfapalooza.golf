"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { subscribeToPush } from "@/lib/notifications/push-client";
import { getTimezoneAbbreviation } from "@/lib/utils/timezone";
import { FakeAdCarousel } from "@/components/FakeAdCarousel";
import { BirthdayBanner } from "@/components/BirthdayBanner";
import { PollHomeButton } from "@/components/polls/PollHomeButton";

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

function SvgIcon({ src, className = "w-8 h-8" }: { src: string; className?: string }) {
  return (
    <div
      className={`${className} bg-current`}
      style={{
        WebkitMaskImage: `url(${src})`,
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskImage: `url(${src})`,
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
      }}
    />
  );
}

// Each quick link specifies which contest types must exist for it to show.
// null = always show.
const allQuickLinks = [
  {
    href: "/kgb-cup",
    label: "KGB Cup",
    color: "bg-indigo-50 text-indigo-700",
    requiresContest: "ryder_cup" as const,
    icon: (
      <SvgIcon src="/noun-trophy-8286316.svg" />
    ),
  },
  {
    href: "/skins",
    label: "Skins",
    color: "bg-lime-50 text-lime-700",
    requiresContest: "scramble" as const,
    icon: (
      <SvgIcon src="/noun-dollar-8198053.svg" />
    ),
  },
  {
    href: "/hundred-feet",
    label: "100 Feet",
    color: "bg-red-50 text-red-700",
    requiresContest: "scramble" as const,
    icon: (
      <SvgIcon src="/noun-measure-tape-8065234.svg" />
    ),
  },
  {
    href: "/daily-games",
    label: "Daily Games",
    color: "bg-teal-50 text-teal-700",
    requiresContest: "scramble" as const,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
        <circle cx="12" cy="12" r="5.5" strokeWidth={1.5} />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/pickem",
    label: "Pick'em",
    color: "bg-amber-50 text-amber-700",
    requiresContest: "pickem" as const,
    icon: (
      <SvgIcon src="/noun-american-football-2591628.svg" className="w-7 h-7" />
    ),
  },
  {
    href: "/schedule",
    label: "Schedule",
    color: "bg-sky-50 text-sky-700",
    requiresContest: null,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: "/course",
    label: "Course",
    color: "bg-green-50 text-green-700",
    requiresContest: null,
    icon: (
      <SvgIcon src="/noun-golf-flag-5010192.svg" />
    ),
  },
  {
    href: "/rooms",
    label: "Rooms",
    color: "bg-violet-50 text-violet-700",
    requiresContest: null,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    href: "/options",
    label: "My Options",
    color: "bg-indigo-50 text-indigo-700",
    requiresContest: null,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    href: "/articles",
    label: "Articles",
    color: "bg-rose-50 text-rose-700",
    requiresContest: null,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    ),
  },
  {
    href: "/polls",
    label: "Polls",
    color: "bg-pink-50 text-pink-700",
    requiresContest: null,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21h18M7 21V11M12 21V7M17 21V14" />
      </svg>
    ),
  },
  {
    href: "/notebook",
    label: "Notebook",
    color: "bg-emerald-50 text-emerald-700",
    requiresContest: null,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    href: "/my-rounds",
    label: "My Rounds",
    color: "bg-orange-50 text-orange-700",
    requiresContest: null,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    href: "/best-line",
    label: "Best Line",
    color: "bg-amber-50 text-amber-700",
    requiresContest: null,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    href: "/loozers",
    label: "Loozers",
    color: "bg-cyan-50 text-cyan-700",
    requiresContest: null,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    href: "/nominations",
    label: "Add Rookie",
    color: "bg-purple-50 text-purple-700",
    requiresContest: null,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
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
  myTeeTime,
  myStartingHole,
  myTeammates,
  teeTimeDay,
  simulatedDate = null,
  participants = [],
  nextScheduleItem = null,
  timezone,
  courseName = null,
  myCalcuttaRoster = null,
  calcuttaBuyerOwes = 0,
  contestTypes = [],
  activeRounds = [],
  kgbCupActiveRound = null,
  teeTimeLinkHref = "/scorecards",
  calcuttaAuctionActive = false,
  pickemUrgent = false,
  myWinnings = null,
  myBalance = null,
  optionsDeadline = null,
  hasSubmittedOptions = false,
  latestArticle = null,
  hiddenQuickLinks = [],
  initialBirthdays = [],
}: {
  displayName: string;
  trip: TripData | null;
  incompleteActionCount: number;
  totalActionCount: number;
  rsvpLikelihood: number | null;
  myTeeTime?: string | null;
  myStartingHole?: number | null;
  myTeammates?: string[];
  teeTimeDay?: string | null;
  simulatedDate?: string | null;
  participants?: { userId: string; likelihood: number; displayName: string; avatarUrl?: string | null }[];
  nextScheduleItem?: { title: string; location: string | null; time: string | null; dayLabel: string } | null;
  timezone?: string;
  courseName?: string | null;
  myCalcuttaRoster?: { userId: string; displayName: string; avatarUrl: string | null; sharePct: number }[] | null;
  calcuttaBuyerOwes?: number;
  contestTypes?: string[];
  activeRounds?: { teamId: string; teeTime: string; startingHole: number | null; contestId: string; dayNumber: number }[];
  kgbCupActiveRound?: { teeTime: string; startingHole: number | null } | null;
  teeTimeLinkHref?: string;
  calcuttaAuctionActive?: boolean;
  pickemUrgent?: boolean;
  myWinnings?: { total: number; breakdown: { prizeName: string; amount: number }[] } | null;
  myBalance?: { charges: number; payments: number; balance: number } | null;
  optionsDeadline?: string | null;
  hasSubmittedOptions?: boolean;
  latestArticle?: { id: string; title: string; publishAt: string; imageUrl: string | null; preview: string | null; focalX?: number; focalY?: number } | null;
  hiddenQuickLinks?: string[];
  initialBirthdays?: { id: string; display_name: string; avatar_url: string | null; age: number }[];
}) {
  const router = useRouter();

  // Filter quick links based on which contest types exist and visibility
  const quickLinks = allQuickLinks.filter((link) => {
    // Hide if visibility says so
    if (hiddenQuickLinks && hiddenQuickLinks.includes(link.href)) return false;
    if (link.requiresContest === null) return true;
    if (!contestTypes || contestTypes.length === 0) return true; // show all if no data yet
    if (Array.isArray(link.requiresContest)) {
      return link.requiresContest.some((ct) => contestTypes.includes(ct));
    }
    return contestTypes.includes(link.requiresContest);
  });

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
  // Time gates removed — scoring links show whenever data exists

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
    <div className="px-4 pt-6 pb-8 space-y-3">
      <BirthdayBanner initialBirthdays={initialBirthdays} />
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

      {/* Event Info Card */}
      {trip && (
        <div className="bg-white rounded-2xl p-5 border-2 border-green-600 shadow-sm flex items-center gap-4">
          <img
            src="/logo.png"
            alt={trip.trip_name}
            className="w-20 h-20 object-contain flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-green-700 font-bold text-lg">{trip.trip_name}</p>
            {(() => {
              const [y, m, d] = trip.start_date.split("-").map(Number);
              const date = new Date(y, m - 1, d);
              const formatted = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
              const venue = courseName || trip.location;
              return (
                <>
                  <p className="text-green-600 font-semibold text-sm">{formatted}</p>
                  {venue && (
                    <p className="text-green-600/60 text-xs">{venue}</p>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Countdown Card */}
      {trip && daysLeft !== null && daysLeft > 0 && (
        <div className="bg-green-50 rounded-xl px-4 py-3 border border-green-200 flex items-baseline justify-center gap-2">
          <span className="text-3xl font-bold text-green-700">{daysLeft}</span>
          <span className="text-base text-green-600">
            {daysLeft === 1 ? "day" : "days"} to go
          </span>
        </div>
      )}

      {/* Latest Article Card */}
      {latestArticle && (
        <Link
          href={`/articles/${latestArticle.id}`}
          className="block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden active:scale-[0.98] transition-transform"
        >
          {latestArticle.imageUrl ? (
            <div className="relative h-36">
              <img
                src={latestArticle.imageUrl}
                alt=""
                className="w-full h-full object-cover"
                style={{ objectPosition: `${latestArticle.focalX ?? 50}% ${latestArticle.focalY ?? 50}%` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <p className="font-bold text-white text-lg leading-tight drop-shadow-sm">{latestArticle.title}</p>
                <p className="text-white/70 text-xs mt-1">
                  {new Date(latestArticle.publishAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
          ) : (
            <div className="px-4 pt-4">
              <p className="font-bold text-gray-900 text-lg leading-tight">{latestArticle.title}</p>
              <p className="text-gray-400 text-xs mt-1">
                {new Date(latestArticle.publishAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          )}
          {latestArticle.preview && (
            <div className="px-4 py-3 overflow-hidden">
              <p className="text-xs text-gray-600 overflow-hidden" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {latestArticle.preview}
              </p>
            </div>
          )}
        </Link>
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
                    <div className="flex flex-wrap gap-1.5">
                      {group.map((p, i) => (
                        <Link key={i} href={`/loozers/${p.userId}`} className="inline-flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 bg-gray-100 rounded-full text-sm text-gray-700">
                          {p.avatarUrl ? (
                            <img src={p.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                          ) : (
                            <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[9px] font-bold">
                              {(p.displayName || "?")[0].toUpperCase()}
                            </span>
                          )}
                          {p.displayName}
                        </Link>
                      ))}
                    </div>
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
          href={teeTimeLinkHref}
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

      {/* Score Your Round Cards — one per scramble contest */}
      {activeRounds.map((round) => {
        const dayLabel = trip?.start_date
          ? (() => {
              const [y, m, d] = trip.start_date.split("-").map(Number);
              const date = new Date(y, m - 1, d + round.dayNumber - 1);
              return date.toLocaleDateString("en-US", { weekday: "long" });
            })()
          : `Day ${round.dayNumber}`;
        return (
          <Link
            key={round.contestId}
            href={`/scoring?contest_id=${round.contestId}`}
            className="flex items-center gap-4 p-4 bg-green-600 rounded-2xl shadow-lg shadow-green-600/25 active:scale-95 transition-transform"
          >
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/20 text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-bold text-white text-lg">Score {dayLabel}</p>
              <p className="text-white/70 text-sm">
                Enter scramble scores live
              </p>
            </div>
            <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        );
      })}

      {/* Score KGB Cup Card */}
      {kgbCupActiveRound && (
        <Link
          href="/kgb-cup/scoring"
          className="flex items-center gap-4 p-4 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-600/25 active:scale-95 transition-transform"
        >
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/20 text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-bold text-white text-lg">Score KGB Cup</p>
            <p className="text-white/70 text-sm">
              Enter match play scores
            </p>
          </div>
          <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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

      {/* My Calcutta Roster Card */}
      {/* TODO: REMOVE MOCK — using fake 5-name roster for layout preview */}
      {myCalcuttaRoster && myCalcuttaRoster.length > 0 && (
        <Link
          href="/calcutta"
          className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-200 shadow-sm active:scale-95 transition-transform"
        >
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-purple-50 text-purple-600">
            <SvgIcon src="/noun-gavel-auction.svg" className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">
              My Calcutta Roster
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {myCalcuttaRoster.map((g, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 bg-gray-100 rounded-full text-sm text-gray-700" onClick={(e) => { e.preventDefault(); window.location.href = `/loozers/${g.userId}`; }}>
                  {g.avatarUrl ? (
                    <img src={g.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-[9px] font-bold">
                      {(g.displayName || "?")[0].toUpperCase()}
                    </span>
                  )}
                  {g.displayName}
                  {g.sharePct < 100 && (
                    <span className="text-[10px] text-gray-400 font-medium">{g.sharePct}%</span>
                  )}
                </span>
              ))}
            </div>
          </div>
          {calcuttaBuyerOwes > 0 && (
            <div className="flex-shrink-0 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-1.5 text-center animate-pulse">
              <p className="text-xs font-semibold uppercase leading-tight">You owe</p>
              <p className="text-base font-bold leading-tight">${calcuttaBuyerOwes.toFixed(0)}</p>
            </div>
          )}
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {/* Calcutta Winnings Card */}
      {myWinnings && myWinnings.total > 0 && (
        <Link
          href="/calcutta"
          className="flex items-center gap-4 p-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-2xl border border-emerald-200 shadow-sm active:scale-95 transition-transform"
        >
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-emerald-600 font-medium">Calcutta Winnings</p>
            <p className="text-2xl font-bold text-emerald-800">${myWinnings.total.toFixed(2)}</p>
            {myWinnings.breakdown.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {myWinnings.breakdown.map((b, i) => (
                  <span key={i} className="text-[10px] text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                    {b.prizeName}: ${b.amount.toFixed(0)}
                  </span>
                ))}
              </div>
            )}
          </div>
          <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {/* Balance Card */}
      {myBalance && (
        <Link
          href="/financials"
          className={`flex items-center gap-4 p-4 rounded-2xl border shadow-sm active:scale-95 transition-transform ${
            myBalance.balance < 0
              ? "bg-red-50 border-red-200"
              : "bg-green-50 border-green-200"
          }`}
        >
          <div
            className={`flex items-center justify-center w-12 h-12 rounded-full flex-shrink-0 ${
              myBalance.balance < 0
                ? "bg-red-100 text-red-600"
                : "bg-green-100 text-green-600"
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${myBalance.balance < 0 ? "text-red-600" : "text-green-600"}`}>
              {myBalance.balance < 0 ? "Balance Due" : "Account Balance"}
            </p>
            <p className={`text-2xl font-bold ${myBalance.balance < 0 ? "text-red-700" : "text-green-700"}`}>
              {Math.abs(myBalance.balance).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: myBalance.balance % 1 === 0 ? 0 : 2 })}
            </p>
            {myBalance.balance < 0 && myBalance.payments > 0 && (
              <p className="text-xs text-red-500 mt-0.5">
                {myBalance.payments.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 })} paid of {myBalance.charges.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 })}
              </p>
            )}
          </div>
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {/* Options Action Card */}
      {optionsDeadline && (() => {
        const deadline = new Date(optionsDeadline);
        const formatted = deadline.toLocaleDateString("en-US", { month: "long", day: "numeric" });
        return (
          <Link
            href="/options"
            className="flex items-center gap-4 p-4 bg-green-600 rounded-2xl shadow-lg shadow-green-600/25 active:scale-95 transition-transform"
          >
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/20 text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-bold text-white text-lg">Choose your trip options</p>
              <p className="text-white/70 text-sm">
                by {formatted}!
              </p>
            </div>
            <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        );
      })()}

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

      {/* Active poll CTA — hidden when no active poll exists for this user */}
      <div className="mt-3">
        <PollHomeButton />
      </div>

      {/* Quick Links */}
      <div className="mt-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Quick Links
        </h2>
        <div className="flex flex-wrap justify-center gap-3">
          {quickLinks.map((link) => {
            const isCalcuttaLive = link.href === "/calcutta" && calcuttaAuctionActive;
            const isPickemUrgent = link.href === "/pickem" && pickemUrgent;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center p-4 rounded-2xl border shadow-sm active:scale-95 transition-transform ${
                  isCalcuttaLive
                    ? "bg-purple-50 border-purple-300 shadow-md animate-auction-pulse"
                    : isPickemUrgent
                    ? "bg-amber-50 border-amber-300 shadow-md animate-pickem-pulse"
                    : "bg-white border-gray-200"
                }`}
                style={{ width: "calc(33.333% - 8px)" }}
              >
                <div
                  className={`flex items-center justify-center w-12 h-12 rounded-full ${link.color} mb-2`}
                >
                  {link.icon}
                </div>
                <span className={`text-xs font-semibold text-center ${
                  isCalcuttaLive ? "text-purple-800" : isPickemUrgent ? "text-amber-800" : "text-gray-900"
                }`}>
                  {link.label}
                </span>
                {isCalcuttaLive && (
                  <span className="text-[10px] font-black text-purple-600 uppercase tracking-wider animate-pulse">LIVE</span>
                )}
                {isPickemUrgent && (
                  <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider animate-pulse">MAKE PICKS</span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Fake Ads (humor banners) */}
      <FakeAdCarousel maxAds={3} />


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
