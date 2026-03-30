"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CollapsibleSection } from "@/components/admin/CollapsibleSection";
import { TripSettings } from "@/components/admin/TripSettings";
import { EventCoursePicker } from "@/components/admin/EventCoursePicker";
import { EventFacilityLinker } from "@/components/admin/EventFacilityLinker";
import { RosterManager } from "@/components/admin/RosterManager";
import { ContestManager } from "@/components/admin/ContestManager";
import { ItineraryManager } from "@/components/admin/ItineraryManager";
import { RoomManager } from "@/components/admin/RoomManager";
import { ActionItemsManager } from "@/components/admin/ActionItemsManager";
import { AccoladesManager } from "@/components/admin/AccoladesManager";
import { RyderCupManager } from "@/components/admin/RyderCupManager";
import { TeeTimeManager } from "@/components/admin/TeeTimeManager";
import { VisibilityToggles } from "@/components/admin/VisibilityToggles";
import { HundredFeetManager } from "@/components/admin/HundredFeetManager";
import { DailyWinnersManager } from "@/components/admin/DailyWinnersManager";
import { EventDaysManager } from "@/components/admin/EventDaysManager";

function SvgIcon({ src, className = "w-5 h-5" }: { src: string; className?: string }) {
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

interface EventSummary {
  trip: {
    id: string;
    trip_name: string;
    trip_year: number;
    start_date: string;
    status: string;
    course_id: string | null;
  };
  counts: {
    participants: number;
    contests: number;
    scramble_days: number;
    itinerary_items: number;
    facilities_linked: number;
    action_items: number;
    accolades: number;
  };
  course_name: string | null;
  contest_types: string[];
  event_days: {
    id: string;
    day_number: number;
    name: string;
    date: string | null;
  }[];
}

export default function EventDetailPage() {
  const params = useParams();
  const tripId = params.tripId as string;
  const [summary, setSummary] = useState<EventSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    const res = await fetch(`/api/admin/events/${tripId}/summary`);
    const data = await res.json();
    if (data.trip) setSummary(data);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Re-fetch summary when contests change (to update which sections are shown)
  useEffect(() => {
    const handler = () => fetchSummary();
    window.addEventListener("contests-changed", handler);
    return () => window.removeEventListener("contests-changed", handler);
  }, [fetchSummary]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="px-4 pt-6 text-center text-gray-500">
        Event not found.
      </div>
    );
  }

  const { trip, counts, contest_types = [], event_days = [] } = summary;
  const hasContestType = (type: string) => contest_types.includes(type);
  const hasCornhole = hasContestType("cornhole_singles") || hasContestType("cornhole_doubles");
  const hasScramble = hasContestType("scramble");

  return (
    <div className="px-4 pt-6 pb-8 space-y-3">
      <Link
        href="/admin"
        className="flex items-center gap-1 text-green-700 text-sm font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Dashboard
      </Link>

      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">
          {trip.trip_name} {trip.trip_year}
        </h1>
        {trip.status === "archived" && (
          <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">
            Archived
          </span>
        )}
      </div>

      <CollapsibleSection
        title="Visibility"
        summary="Control what Loozers see"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        }
      >
        <VisibilityToggles tripId={tripId} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Settings"
        summary={trip.start_date ? new Date(trip.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Not configured"}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
      >
        <TripSettings tripId={tripId} hideEventList />
      </CollapsibleSection>

      <EventCoursePicker tripId={tripId} />

      <EventFacilityLinker tripId={tripId} />

      <CollapsibleSection
        title="Event Days"
        summary={`${event_days.length} day${event_days.length !== 1 ? "s" : ""}`}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
      >
        <EventDaysManager tripId={tripId} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Roster"
        summary={`${counts.participants} participant${counts.participants !== 1 ? "s" : ""}`}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        }
      >
        <RosterManager tripId={tripId} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Contests"
        summary={`${counts.contests} contest${counts.contests !== 1 ? "s" : ""}`}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        }
      >
        <ContestManager tripId={tripId} />
      </CollapsibleSection>

      {hasContestType("ryder_cup") && (
        <CollapsibleSection
          title="Ryder Cup Teams"
          summary="Manage teams &amp; pairings"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
          }
        >
          <RyderCupManager tripId={tripId} />
        </CollapsibleSection>
      )}

      {hasScramble && (
        <Link
          href={`/admin/events/${tripId}/scrambles`}
          className="flex items-center gap-3 bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4 active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-blue-700 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Scrambles</p>
            <p className="text-xs text-gray-500">Teams, scoring &amp; BSPITW</p>
          </div>
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {hasCornhole && (
        <Link
          href={`/admin/events/${tripId}/cornhole`}
          className="flex items-center gap-3 bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4 active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-orange-50 text-orange-700 flex-shrink-0">
            <SvgIcon src="/noun-cornhole-6941307.svg" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Cornhole</p>
            <p className="text-xs text-gray-500">Teams &amp; brackets</p>
          </div>
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {hasScramble && (
        <CollapsibleSection
          title="100 Feet!"
          summary="Distance from pin on #18"
          iconColor="text-red-700"
          icon={
            <SvgIcon src="/noun-measure-tape-8065234.svg" />
          }
        >
          <HundredFeetManager tripId={tripId} />
        </CollapsibleSection>
      )}

      {hasScramble && (
        <CollapsibleSection
          title="Daily Winners"
          summary="CTP &amp; Long Putt"
          iconColor="text-teal-700"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
              <circle cx="12" cy="12" r="5.5" strokeWidth={1.5} />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
            </svg>
          }
        >
          <DailyWinnersManager tripId={tripId} />
        </CollapsibleSection>
      )}

      {hasContestType("calcutta") && (
        <Link
          href={`/admin/events/${tripId}/calcutta`}
          className="flex items-center gap-3 bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4 active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-50 text-purple-700 flex-shrink-0">
            <SvgIcon src="/noun-gavel-auction.svg" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Calcutta Auction</p>
            <p className="text-xs text-gray-500">Auction order, prizes &amp; bids</p>
          </div>
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      <CollapsibleSection
        title="Tee Times"
        summary={`${event_days.length} day${event_days.length !== 1 ? "s" : ""}`}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      >
        <TeeTimeManager tripId={tripId} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Schedule"
        summary={`${counts.itinerary_items} item${counts.itinerary_items !== 1 ? "s" : ""}`}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
      >
        <ItineraryManager tripId={tripId} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Rooms"
        summary={`${counts.facilities_linked} facilit${counts.facilities_linked !== 1 ? "ies" : "y"}`}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        }
      >
        <RoomManager tripId={tripId} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Action Items"
        summary={`${counts.action_items} item${counts.action_items !== 1 ? "s" : ""}`}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      >
        <ActionItemsManager tripId={tripId} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Accolades"
        summary={`${counts.accolades} award${counts.accolades !== 1 ? "s" : ""}`}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        }
      >
        <AccoladesManager tripId={tripId} />
      </CollapsibleSection>
    </div>
  );
}
