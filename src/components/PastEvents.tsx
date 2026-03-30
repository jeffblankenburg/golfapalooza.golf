"use client";

import { useState } from "react";

interface Accolade {
  id: string;
  title: string;
  user: { display_name: string } | null;
}

interface ItineraryItem {
  id: string;
  title: string;
  location: string | null;
  day_number: number | null;
  start_date: string | null;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
}

interface PastEvent {
  id: string;
  trip_name: string;
  trip_year: number;
  start_date: string;
  location: string | null;
  hotel_name: string | null;
  accolades: Accolade[];
  itinerary: ItineraryItem[];
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getDayLabel(startDate: string, dayNum: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  const d = new Date(year, month - 1, day + dayNum - 1);
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

function formatDateReadable(dateStr: string | null): string {
  if (!dateStr) return "";
  const [, month, day] = dateStr.split("-").map(Number);
  return `${MONTH_SHORT[month - 1]} ${day}`;
}

export function PastEvents({ events }: { events: PastEvent[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="px-4 pb-8 space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Past Events</h2>

      {events.map((event) => {
        const isExpanded = expandedId === event.id;
        const preEvent = event.itinerary.filter((i) => i.day_number === null);
        const days = [...new Set(event.itinerary.filter((i) => i.day_number !== null).map((i) => i.day_number!))].sort((a, b) => a - b);

        return (
          <div
            key={event.id}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
          >
            {/* Header — always visible */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : event.id)}
              className="w-full px-4 py-4 flex items-center justify-between text-left"
            >
              <div>
                <p className="text-base font-semibold text-gray-900">{event.trip_name}</p>
                {event.location && (
                  <p className="text-sm text-gray-500">{event.location}</p>
                )}
              </div>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Expanded details */}
            {isExpanded && (
              <div className="border-t border-gray-200">
                {/* Overview */}
                <div className="px-4 py-3 bg-gray-50 space-y-1">
                  {event.location && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Location</span>
                      <span className="text-gray-900">{event.location}</span>
                    </div>
                  )}
                  {event.hotel_name && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Hotel</span>
                      <span className="text-gray-900">{event.hotel_name}</span>
                    </div>
                  )}
                </div>

                {/* Accolades */}
                {event.accolades.length > 0 && (
                  <div className="px-4 py-3 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Awards
                    </p>
                    <div className="space-y-2">
                      {event.accolades.map((a) => (
                        <div key={a.id} className="flex items-center gap-2">
                          <span className="text-amber-500">&#127942;</span>
                          <div>
                            <span className="text-sm font-medium text-gray-900">
                              {a.title}
                            </span>
                            <span className="text-sm text-gray-500">
                              {" "}&mdash; {a.user?.display_name || "Unknown"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Itinerary */}
                {event.itinerary.length > 0 && (
                  <div className="px-4 py-3 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Schedule
                    </p>

                    {/* Pre-Event */}
                    {preEvent.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-gray-400 mb-1">Pre-Event</p>
                        {preEvent.map((item) => (
                          <div key={item.id} className="flex justify-between text-sm py-0.5">
                            <span className="text-gray-700">{item.title}</span>
                            <span className="text-gray-400 text-xs">
                              {formatDateReadable(item.start_date)}
                              {item.end_date ? ` — ${formatDateReadable(item.end_date)}` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Daily */}
                    {days.map((dayNum) => {
                      const dayItems = event.itinerary.filter((i) => i.day_number === dayNum);
                      if (dayItems.length === 0) return null;
                      return (
                        <div key={dayNum} className="mb-3">
                          <p className="text-xs font-medium text-green-700 mb-1">
                            Day {dayNum} &mdash; {getDayLabel(event.start_date, dayNum)}
                          </p>
                          {dayItems.map((item) => (
                            <div key={item.id} className="flex gap-2 py-0.5">
                              <span className="text-xs text-gray-400 w-16 flex-shrink-0">
                                {formatTime(item.start_time)}
                              </span>
                              <div>
                                <span className="text-sm text-gray-700">{item.title}</span>
                                {item.location && (
                                  <span className="text-xs text-gray-400 ml-1">
                                    &middot; {item.location}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
