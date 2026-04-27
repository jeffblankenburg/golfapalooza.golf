"use client";

import { PollManager } from "@/components/admin/polls/PollManager";

export default function AdminPollsPage() {
  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Polls</h1>
      </div>
      <PollManager />
    </div>
  );
}
