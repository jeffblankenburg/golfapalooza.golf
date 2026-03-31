"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { CollapsibleSection } from "@/components/admin/CollapsibleSection";
import { RyderCupManager } from "@/components/admin/RyderCupManager";
import { KgbCupScoringManager } from "@/components/admin/KgbCupScoringManager";

export default function KgbCupAdminPage() {
  const params = useParams();
  const tripId = params.tripId as string;

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <Link
        href={`/admin/events/${tripId}`}
        className="flex items-center gap-1 text-green-700 text-sm font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Event
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">KGB Cup</h1>

      <CollapsibleSection
        title="Teams & Pairings"
        summary="Manage teams, pairs & foursomes"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
      >
        <RyderCupManager tripId={tripId} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Scoring"
        summary="Handicaps, scores & results"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        }
      >
        <KgbCupScoringManager tripId={tripId} />
      </CollapsibleSection>
    </div>
  );
}
