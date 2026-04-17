"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface TripData {
  trip_name: string;
  trip_year: number;
  start_date: string;
  location: string | null;
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

function getCountdown(startDate: string) {
  const [year, month, day] = startDate.split("-").map(Number);
  const tripDate = new Date(year, month - 1, day);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = tripDate.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

const spectatorQuickLinks = [
  {
    href: "/spectator/kgb-cup",
    label: "KGB Cup",
    color: "bg-indigo-50 text-indigo-700",
    icon: <SvgIcon src="/noun-trophy-8286316.svg" />,
  },
  {
    href: "/spectator/bspitw",
    label: "BSPITW",
    color: "bg-yellow-50 text-yellow-700",
    icon: <SvgIcon src="/noun-trophy-8286316.svg" />,
  },
  {
    href: "/spectator/scorecards",
    label: "Scrambles",
    color: "bg-lime-50 text-lime-700",
    icon: <SvgIcon src="/noun-golf-tee-3895707.svg" />,
  },
  {
    href: "/spectator/cornhole",
    label: "Cornhole",
    color: "bg-orange-50 text-orange-700",
    icon: <SvgIcon src="/noun-cornhole-6941307.svg" />,
  },
  {
    href: "/spectator/calcutta",
    label: "Calcutta",
    color: "bg-purple-50 text-purple-700",
    icon: <SvgIcon src="/noun-gavel-auction.svg" />,
  },
  {
    href: "/spectator/course",
    label: "Course",
    color: "bg-green-50 text-green-700",
    icon: <SvgIcon src="/noun-golf-flag-5010192.svg" />,
  },
  {
    href: "/spectator/loozers",
    label: "Loozers",
    color: "bg-cyan-50 text-cyan-700",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    href: "/spectator/articles",
    label: "Articles",
    color: "bg-rose-50 text-rose-700",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    ),
  },
];

export function SpectatorHomeContent({
  trip,
  courseName = null,
  latestArticle = null,
}: {
  trip: TripData | null;
  courseName?: string | null;
  latestArticle?: { id: string; title: string; publishAt: string; imageUrl: string | null; preview: string | null; focalX?: number; focalY?: number } | null;
}) {
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    if (trip?.start_date) {
      setDaysLeft(getCountdown(trip.start_date));
    }
  }, [trip?.start_date]);

  return (
    <div className="px-4 pt-6 pb-8 space-y-3">
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
          href={`/spectator/articles/${latestArticle.id}`}
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

      {/* Quick Links */}
      <div className="mt-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Quick Links
        </h2>
        <div className="flex flex-wrap justify-center gap-3">
          {spectatorQuickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex flex-col items-center p-4 rounded-2xl border shadow-sm active:scale-95 transition-transform bg-white border-gray-200"
              style={{ width: "calc(33.333% - 8px)" }}
            >
              <div
                className={`flex items-center justify-center w-12 h-12 rounded-full ${link.color} mb-2`}
              >
                {link.icon}
              </div>
              <span className="text-xs font-semibold text-center text-gray-900">
                {link.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
