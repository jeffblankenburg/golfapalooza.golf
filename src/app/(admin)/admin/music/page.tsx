"use client";

import { SongManager } from "@/components/admin/SongManager";

export default function AdminMusicPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Music</h1>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("toggle-add-song"))}
          className="w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center hover:bg-green-700 shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
      <SongManager />
    </div>
  );
}
