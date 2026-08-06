"use client";

import Link from "next/link";
import { WalkupPlayer } from "@/components/admin/WalkupPlayer";

export default function WalkupPlayerPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-3">
        <Link
          href="/admin/music"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Music
        </Link>
      </div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Walk-Up Player</h1>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        1st-tee walk-up songs for the Thursday scramble, in tee-off order.
      </p>
      <WalkupPlayer />
    </div>
  );
}
