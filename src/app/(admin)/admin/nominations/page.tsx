"use client";

import { NominationManager } from "@/components/admin/NominationManager";

export default function AdminNominationsPage() {
  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Rookie Nominations</h1>
      </div>
      <NominationManager />
    </div>
  );
}
