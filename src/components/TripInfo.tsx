"use client";

import Link from "next/link";
import { RsvpStatus } from "./RsvpStatus";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";

interface TripData {
  trip_name: string;
  trip_year: number;
  start_date: string;
  location: string | null;
  hotel_name: string | null;
  hotel_address: string | null;
  notes: string | null;
}

export function TripInfo({
  trip,
  playerCount,
  rsvpLikelihood,
}: {
  trip: TripData | null;
  playerCount: number;
  rsvpLikelihood?: number | null;
}) {
  if (!trip) {
    return (
      <div className="px-4 pt-6">
        <p className="text-gray-500 text-center py-8">
          Trip details haven&apos;t been set up yet.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-gray-900">{trip.trip_name}</h1>
        <PinnedNoteButton pinnedTo="info" />
      </div>

      {/* Overview */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Overview
          </h2>
        </div>
        <div className="divide-y divide-gray-100">
          <InfoRow label="Year" value={String(trip.trip_year)} />
          {trip.location && <InfoRow label="Location" value={trip.location} />}
          <InfoRow label="Loozers" value={`${playerCount} players`} />
          <InfoRow label="Duration" value="4 days" />
        </div>
      </div>

      {/* RSVP Status */}
      <RsvpStatus likelihood={rsvpLikelihood ?? null} />

      {/* Schedule Link */}
      <Link
        href="/schedule"
        className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-200 shadow-sm active:scale-95 transition-transform"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-50 text-green-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">View Full Schedule</p>
            <p className="text-xs text-gray-500">Daily itinerary and events</p>
          </div>
        </div>
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* Hotel */}
      {(trip.hotel_name || trip.hotel_address) && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Hotel
            </h2>
          </div>
          <div className="px-4 py-4">
            {trip.hotel_name && (
              <p className="font-semibold text-gray-900">{trip.hotel_name}</p>
            )}
            {trip.hotel_address && (
              <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">
                {trip.hotel_address}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Rooms Link */}
      <Link
        href="/rooms"
        className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-200 shadow-sm active:scale-95 transition-transform"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-50 text-indigo-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">View Room Assignments</p>
            <p className="text-xs text-gray-500">See who&apos;s staying where</p>
          </div>
        </div>
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* Notes */}
      {trip.notes && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Notes
            </h2>
          </div>
          <div className="px-4 py-4">
            <p className="text-sm text-gray-700 whitespace-pre-line">
              {trip.notes}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}
