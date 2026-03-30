"use client";

import { SongManager } from "@/components/admin/SongManager";

export default function AdminMusicPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Music</h1>
      <SongManager />
    </div>
  );
}
