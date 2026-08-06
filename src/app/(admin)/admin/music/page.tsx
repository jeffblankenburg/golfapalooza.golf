"use client";

import Link from "next/link";
import { SongManager } from "@/components/admin/SongManager";

export default function AdminMusicPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Music</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/music/walkups"
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
            </svg>
            Walk-Up Player
          </Link>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("toggle-add-song"))}
            className="w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center hover:bg-green-700 shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>
      <SongManager />
    </div>
  );
}
