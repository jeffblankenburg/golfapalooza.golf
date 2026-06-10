"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface Participant {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
}

/**
 * Reusable accordion that shows all event participants with checkboxes
 * to toggle contest enrollment. Fetches contest participants on mount
 * and syncs with the contest_participants API.
 *
 * Removing a participant is destructive — the API also clears any
 * type-specific child rows ("they were a mistake" semantics). Pickem
 * removals also wipe the user's picks and payment record. We surface a
 * warning modal so admins know what they're about to delete.
 */
export function ContestParticipantsAccordion({
  tripId,
  contestName,
  contestId,
  contestType,
  defaultOpen = false,
  onChanged,
}: {
  tripId: string;
  contestName: string;
  contestId: string;
  /** Optional — drives the warning-modal copy. Pickem callouts the
   *  picks + payment cleanup; everything else just says "remove". */
  contestType?: string;
  defaultOpen?: boolean;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [fundedByOptionIds, setFundedByOptionIds] = useState<Set<string>>(new Set());
  const [togglingUser, setTogglingUser] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Participant | null>(null);
  const [blockedRemoval, setBlockedRemoval] = useState<Participant | null>(null);

  const fetchData = useCallback(async () => {
    const [rosterRes, enrolledRes] = await Promise.all([
      fetch(`/api/admin/participants?trip_id=${tripId}`),
      fetch(`/api/admin/contests/participants?contest_id=${contestId}`),
    ]);
    const rosterData = await rosterRes.json();
    const enrolledData = await enrolledRes.json();

    // Roster may come as { users: [...] } or { participants: [...] }
    const roster = (rosterData.users || rosterData.participants || [])
      .filter((u: { is_participating?: boolean }) => u.is_participating !== false)
      .map((u: { id?: string; user_id?: string; display_name?: string; full_name?: string | null; avatar_url?: string | null }) => ({
        id: u.id || u.user_id || "",
        display_name: u.display_name || "Unknown",
        full_name: u.full_name || null,
        avatar_url: u.avatar_url || null,
      }))
      .sort((a: Participant, b: Participant) => a.display_name.localeCompare(b.display_name));

    const enrolled = new Set<string>(
      (enrolledData.participants || []).map((p: { user_id: string }) => p.user_id)
    );
    const funded = new Set<string>(enrolledData.funded_by_option_user_ids || []);

    setParticipants(roster);
    setEnrolledIds(enrolled);
    setFundedByOptionIds(funded);
    setLoading(false);
  }, [tripId, contestId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggle = async (userId: string) => {
    const isIn = enrolledIds.has(userId);
    if (isIn) {
      const p = participants.find((x) => x.id === userId);
      if (!p) return;
      // Blocked: paid via option. Surface an info modal instead of the
      // destructive confirm — admin must clear the option first.
      if (fundedByOptionIds.has(userId)) {
        setBlockedRemoval(p);
        return;
      }
      // Removal is destructive — show confirmation first.
      setPendingRemoval(p);
      return;
    }
    // Adding is non-destructive — optimistic immediate write.
    setTogglingUser(userId);
    setEnrolledIds((prev) => {
      const next = new Set(prev);
      next.add(userId);
      return next;
    });
    try {
      await fetch("/api/admin/contests/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contest_id: contestId, user_id: userId }),
      });
      onChanged?.();
    } catch {
      setEnrolledIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
    setTogglingUser(null);
  };

  const confirmRemoval = async () => {
    if (!pendingRemoval) return;
    const userId = pendingRemoval.id;
    setTogglingUser(userId);
    setPendingRemoval(null);
    setEnrolledIds((prev) => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
    try {
      await fetch("/api/admin/contests/participants", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contest_id: contestId, user_id: userId }),
      });
      onChanged?.();
    } catch {
      setEnrolledIds((prev) => {
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
    }
    setTogglingUser(null);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{contestName} Participants</span>
          {!loading && (
            <span className="text-xs text-gray-400">
              {enrolledIds.size} / {participants.length}
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-200 px-4 py-2">
          {loading ? (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            participants.map((p) => {
              const isIn = enrolledIds.has(p.id);
              const isToggling = togglingUser === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  disabled={isToggling}
                  className="w-full flex items-center gap-2.5 py-2 active:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      isIn ? "bg-green-600 border-green-600" : "border-gray-300"
                    }`}
                  >
                    {isIn && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[0.625rem] font-bold flex-shrink-0">
                      {(p.display_name || "?")[0].toUpperCase()}
                    </span>
                  )}
                  <span className="text-sm text-gray-900">{p.display_name}</span>
                </button>
              );
            })
          )}
        </div>
      )}

      <ConfirmModal
        open={!!pendingRemoval}
        title={`Remove ${pendingRemoval?.display_name ?? ""} from ${contestName}?`}
        message={
          contestType === "pickem"
            ? "This will permanently delete their picks, payment record, and roster entry. Cannot be undone."
            : "This will remove them from this contest's roster. Cannot be undone."
        }
        confirmLabel="Remove"
        destructive
        onConfirm={confirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />

      <ConfirmModal
        open={!!blockedRemoval}
        title={`${blockedRemoval?.display_name ?? ""} paid via option`}
        message="This Loozer's option selection funds the contest, so removing them here would orphan their charge. Clear their option in /admin/selections first to refund, then come back and remove them."
        confirmLabel="OK"
        cancelLabel={null}
        onConfirm={() => setBlockedRemoval(null)}
        onCancel={() => setBlockedRemoval(null)}
      />
    </div>
  );
}
