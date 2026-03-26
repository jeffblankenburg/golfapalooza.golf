"use client";

import { FacilityManager } from "@/components/admin/FacilityManager";
import { useRef } from "react";

export default function FacilitiesPage() {
  const managerRef = useRef<{ openAdd: () => void }>(null);

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Manage Facilities</h1>
        <button
          onClick={() => managerRef.current?.openAdd()}
          className="w-9 h-9 rounded-full bg-green-600 text-white flex items-center justify-center shadow active:scale-95 transition-transform"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
      <FacilityManager ref={managerRef} />
    </div>
  );
}
