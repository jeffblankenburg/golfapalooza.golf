"use client";

import { AnnouncementManager } from "@/components/admin/AnnouncementManager";

export default function AdminAnnouncementsPage() {
  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
      </div>
      <AnnouncementManager />
    </div>
  );
}
