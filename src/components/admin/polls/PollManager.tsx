"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "../ConfirmModal";
import { BottomDrawer } from "../BottomDrawer";
import { PollEditor } from "./PollEditor";
import { PollAdminResults } from "./PollAdminResults";
import {
  formatInTimezone,
  getTimezoneAbbreviation,
  naiveDatetimeToUTC,
} from "@/lib/utils/timezone";
import type { Poll, PollResults, PollStatus } from "@/types/golf";
import { DragHandle } from "@/components/DragHandle";

interface User {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_active: boolean;
}

interface PollListRow extends Poll {
  response_count?: number;
  // Admin-only attribution resolved server-side (issue #142).
  created_by_name?: string | null;
  on_behalf_of_name?: string | null;
}

const statusBadgeColors: Record<PollStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  scheduled: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  closed: "bg-gray-200 text-gray-600",
};

const statusOrder: PollStatus[] = ["active", "scheduled", "draft", "closed"];

export function PollManager() {
  const [polls, setPolls] = useState<PollListRow[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [eventParticipantIds, setEventParticipantIds] = useState<string[]>([]);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [tripTimezone, setTripTimezone] = useState("America/New_York");
  const [loading, setLoading] = useState(true);

  const [editingPoll, setEditingPoll] = useState<Poll | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  const [resultsPoll, setResultsPoll] = useState<Poll | null>(null);
  const [resultsData, setResultsData] = useState<PollResults | null>(null);

  const [confirmAction, setConfirmAction] = useState<
    | { type: "close" | "delete"; pollId: string; title: string }
    | { type: "reopen"; pollId: string; title: string }
    | null
  >(null);
  const [reopenEndsAt, setReopenEndsAt] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [pollsRes, usersRes, tripsRes] = await Promise.all([
        fetch("/api/admin/polls"),
        fetch("/api/admin/users"),
        fetch("/api/admin/trips?status=active"),
      ]);
      const pollsData = await pollsRes.json();
      const usersData = await usersRes.json();
      const tripsData = await tripsRes.json();

      if (pollsData.polls) setPolls(pollsData.polls);
      if (usersData.users) {
        setAllUsers(usersData.users.filter((u: User) => u.is_active));
      }

      const activeTrip = tripsData.trip;
      if (activeTrip) {
        setActiveTripId(activeTrip.id);
        if (activeTrip.timezone) setTripTimezone(activeTrip.timezone);
        const partsRes = await fetch(
          `/api/admin/participants?trip_id=${activeTrip.id}`
        );
        const partsData = await partsRes.json();
        if (partsData.users) {
          setEventParticipantIds(
            partsData.users
              .filter((p: { is_participating: boolean }) => p.is_participating)
              .map((p: { id: string }) => p.id)
          );
        }
      }
    } catch {
      // silent — will show empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const openEditor = async (poll: PollListRow) => {
    // Fetch full detail (questions/options)
    const res = await fetch(`/api/admin/polls/${poll.id}`);
    if (res.ok) {
      const data = await res.json();
      setEditingPoll(data.poll);
    }
  };

  const openResults = async (poll: PollListRow) => {
    const res = await fetch(`/api/admin/polls/${poll.id}`);
    if (res.ok) {
      const data = await res.json();
      setResultsPoll(data.poll);
      setResultsData(data.results);
    }
  };

  const handleCloseAction = async (id: string) => {
    const res = await fetch(`/api/admin/polls/${id}/close`, { method: "POST" });
    if (res.ok) {
      showToast("Poll closed");
      fetchData();
    } else {
      const data = await res.json();
      setActionError(data.error || "Failed to close");
    }
  };

  const handleDeleteAction = async (id: string) => {
    const res = await fetch(`/api/admin/polls/${id}`, { method: "DELETE" });
    if (res.ok) {
      showToast("Poll deleted");
      fetchData();
    } else {
      const data = await res.json();
      setActionError(data.error || "Failed to delete");
    }
  };

  const handleReopenAction = async (id: string) => {
    if (!reopenEndsAt) {
      setActionError("Pick an end time");
      return;
    }
    const endISO = naiveDatetimeToUTC(reopenEndsAt, tripTimezone);
    const res = await fetch(`/api/admin/polls/${id}/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ends_at: endISO }),
    });
    if (res.ok) {
      showToast("Poll reopened");
      setConfirmAction(null);
      setReopenEndsAt("");
      fetchData();
    } else {
      const data = await res.json();
      setActionError(data.error || "Failed to reopen");
    }
  };

  const grouped: Record<PollStatus, PollListRow[]> = {
    draft: [],
    scheduled: [],
    active: [],
    closed: [],
  };
  for (const p of polls) grouped[p.status].push(p);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-50 animate-slide-down">
          <div className="rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg bg-green-600">
            {toast}
          </div>
        </div>
      )}

      <button
        onClick={() => setCreating(true)}
        className="w-full bg-green-600 text-white rounded-xl py-3 text-sm font-semibold active:bg-green-700"
      >
        + New Poll
      </button>

      {polls.length === 0 && (
        <div className="text-center text-sm text-gray-400 py-8">
          No polls yet. Create one to get started.
        </div>
      )}

      {statusOrder.map((status) => {
        const list = grouped[status];
        if (list.length === 0) return null;
        return (
          <div key={status}>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {status} ({list.length})
            </h2>
            <div className="space-y-2">
              {list.map((p) => (
                <div
                  key={p.id}
                  className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {p.title}
                      </p>
                      {p.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {p.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-1.5 text-[0.6875rem] text-gray-500">
                        <span
                          className={`px-1.5 py-0.5 rounded-full font-medium ${statusBadgeColors[p.status]}`}
                        >
                          {p.status}
                        </span>
                        <span>
                          {p.audience_type === "event"
                            ? "Current event"
                            : p.audience_type === "everyone"
                              ? "Everyone"
                              : `${(p.audience_user_ids || []).length} custom`}
                        </span>
                        {p.is_anonymous && <span>Anonymous</span>}
                        {p.starts_at && (
                          <span>
                            {formatInTimezone(p.starts_at, tripTimezone, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}{" "}
                            →{" "}
                            {p.ends_at &&
                              formatInTimezone(p.ends_at, tripTimezone, {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}{" "}
                            {getTimezoneAbbreviation(tripTimezone)}
                          </span>
                        )}
                        {p.response_count !== undefined && (
                          <span>
                            {p.response_count}{" "}
                            {p.response_count === 1 ? "response" : "responses"}
                          </span>
                        )}
                      </div>
                      {(p.created_by_name || p.on_behalf_of_name) && (
                        <div className="mt-1 text-[0.6875rem] text-gray-400">
                          {p.created_by_name && <span>by {p.created_by_name}</span>}
                          {p.on_behalf_of_name && (
                            <span> · for {p.on_behalf_of_name}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    {p.status === "draft" && (
                      <button
                        onClick={() => openEditor(p)}
                        className="text-xs font-semibold text-green-700 px-2 py-1 rounded-lg active:bg-green-50"
                      >
                        Edit / Publish
                      </button>
                    )}
                    {(p.status === "scheduled" || p.status === "active") && (
                      <>
                        <button
                          onClick={() => openEditor(p)}
                          className="text-xs font-semibold text-gray-700 px-2 py-1 rounded-lg active:bg-gray-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() =>
                            setConfirmAction({
                              type: "close",
                              pollId: p.id,
                              title: p.title,
                            })
                          }
                          className="text-xs font-semibold text-amber-700 px-2 py-1 rounded-lg active:bg-amber-50"
                        >
                          Close now
                        </button>
                      </>
                    )}
                    {p.status === "active" && (
                      <button
                        onClick={() => openResults(p)}
                        className="text-xs font-semibold text-gray-700 px-2 py-1 rounded-lg active:bg-gray-50"
                      >
                        Results
                      </button>
                    )}
                    {p.status === "closed" && (
                      <>
                        <button
                          onClick={() => openResults(p)}
                          className="text-xs font-semibold text-gray-700 px-2 py-1 rounded-lg active:bg-gray-50"
                        >
                          Results
                        </button>
                        <button
                          onClick={() => {
                            setConfirmAction({
                              type: "reopen",
                              pollId: p.id,
                              title: p.title,
                            });
                            setReopenEndsAt("");
                            setActionError(null);
                          }}
                          className="text-xs font-semibold text-blue-700 px-2 py-1 rounded-lg active:bg-blue-50"
                        >
                          Reopen
                        </button>
                      </>
                    )}
                    <button
                      onClick={() =>
                        setConfirmAction({
                          type: "delete",
                          pollId: p.id,
                          title: p.title,
                        })
                      }
                      className="text-xs font-semibold text-red-600 px-2 py-1 rounded-lg active:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Create drawer */}
      <BottomDrawer
        open={creating}
        onClose={() => setCreating(false)}
        title="New poll"
      >
        {creating && (
          <PollEditor
            allUsers={allUsers}
            eventParticipantIds={eventParticipantIds}
            activeTripId={activeTripId}
            tripTimezone={tripTimezone}
            onSaved={() => {
              setCreating(false);
              fetchData();
              showToast("Poll saved");
            }}
            onCancel={() => setCreating(false)}
          />
        )}
      </BottomDrawer>

      {/* Edit drawer */}
      <BottomDrawer
        open={!!editingPoll}
        onClose={() => setEditingPoll(undefined)}
        title="Edit poll"
      >
        {editingPoll && (
          <PollEditor
            poll={editingPoll}
            allUsers={allUsers}
            eventParticipantIds={eventParticipantIds}
            activeTripId={activeTripId}
            tripTimezone={tripTimezone}
            onSaved={() => {
              setEditingPoll(undefined);
              fetchData();
              showToast("Poll saved");
            }}
            onCancel={() => setEditingPoll(undefined)}
          />
        )}
      </BottomDrawer>

      {/* Results drawer */}
      <BottomDrawer
        open={!!resultsPoll}
        onClose={() => {
          setResultsPoll(null);
          setResultsData(null);
        }}
        title={resultsPoll?.title || "Results"}
        subtitle={resultsPoll?.is_anonymous ? "Anonymous poll" : undefined}
      >
        {resultsPoll && resultsData && (
          <div className="px-4 py-4">
            <PollAdminResults
              results={resultsData}
              isAnonymous={resultsPoll.is_anonymous}
              pollTitle={resultsPoll.title}
            />
          </div>
        )}
      </BottomDrawer>

      {/* Confirm: close / delete */}
      <ConfirmModal
        open={
          !!confirmAction &&
          (confirmAction.type === "close" || confirmAction.type === "delete")
        }
        title={
          confirmAction?.type === "close"
            ? "Close poll"
            : confirmAction?.type === "delete"
              ? "Delete poll"
              : ""
        }
        message={
          confirmAction?.type === "close"
            ? `Close "${confirmAction.title}" now? Voters won't be able to change their vote.`
            : confirmAction?.type === "delete"
              ? `Delete "${confirmAction.title}"? This also deletes all responses.`
              : ""
        }
        confirmLabel={confirmAction?.type === "delete" ? "Delete" : "Close"}
        destructive={confirmAction?.type === "delete"}
        onConfirm={() => {
          if (!confirmAction) return;
          const id = confirmAction.pollId;
          const action = confirmAction.type;
          setConfirmAction(null);
          if (action === "close") handleCloseAction(id);
          if (action === "delete") handleDeleteAction(id);
        }}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Confirm: reopen with ends_at picker */}
      {confirmAction?.type === "reopen" && (
        <div className="fixed top-14 bottom-16 left-0 right-0 z-35 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setConfirmAction(null)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100">
              <DragHandle onClose={() => setConfirmAction(null)} className="mb-4" />
              <h2 className="text-xl font-bold text-gray-900">Reopen poll</h2>
              <p className="text-xs text-gray-500 mt-1">
                &ldquo;{confirmAction.title}&rdquo; will become active again.
              </p>
            </div>
            <div className="px-6 py-4 space-y-2">
              <label className="block text-xs text-gray-500">
                New end time ({tripTimezone})
              </label>
              <input
                type="datetime-local"
                value={reopenEndsAt}
                onChange={(e) => setReopenEndsAt(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
              />
              {actionError && (
                <p className="text-xs text-red-600">{actionError}</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
              <button
                onClick={() => handleReopenAction(confirmAction.pollId)}
                className="flex-1 py-3 rounded-xl font-semibold text-[0.9375rem] bg-green-600 text-white"
              >
                Reopen
              </button>
              <button
                onClick={() => {
                  setConfirmAction(null);
                  setActionError(null);
                  setReopenEndsAt("");
                }}
                className="flex-1 py-3 border border-gray-300 rounded-xl font-semibold text-[0.9375rem] text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
