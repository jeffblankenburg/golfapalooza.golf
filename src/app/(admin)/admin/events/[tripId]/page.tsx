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
import { ScrambleManager } from "@/components/admin/ScrambleManager";
import { TeeTimeManager } from "@/components/admin/TeeTimeManager";
import { VisibilityToggles } from "@/components/admin/VisibilityToggles";

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

  const { trip, counts, course_name } = summary;

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

      <CollapsibleSection
        title="Scramble Teams"
        summary="Manage scramble day teams"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        }
      >
        <ScrambleManager tripId={tripId} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Tee Times"
        summary="Days 1–4"
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
