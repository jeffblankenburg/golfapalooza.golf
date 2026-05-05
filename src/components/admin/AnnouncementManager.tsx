"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "./ConfirmModal";
import { BottomDrawer } from "./BottomDrawer";
import { naiveDatetimeToUTC, formatInTimezone, getTimezoneAbbreviation } from "@/lib/utils/timezone";
import { BTN_DESTRUCTIVE } from "@/lib/ui/buttons";

interface User {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_active: boolean;
}

interface BroadcastList {
  id: string;
  name: string;
  user_ids: string[];
  user_count: number;
}

interface AnnouncementRecord {
  id: string;
  title: string;
  body: string | null;
  audience_type: string;
  audience_names?: string[];
  scheduled_for: string;
  status: string;
  sent_at: string | null;
  recipient_count?: number;
}

type AudienceType = "event" | "everyone" | "custom";
type TimingMode = "now" | "schedule";

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function formatScheduledTime(dateStr: string, timezone?: string): string {
  if (timezone) {
    return formatInTimezone(dateStr, timezone, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function UserAvatar({ user }: { user: User }) {
  return user.avatar_url ? (
    <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
  ) : (
    <div className="w-7 h-7 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">
      {user.display_name.charAt(0).toUpperCase()}
    </div>
  );
}

function AudienceLabel({ announcement }: { announcement: AnnouncementRecord }) {
  const { audience_type, audience_names } = announcement;

  if (audience_type === "everyone") {
    return <p className="text-xs text-gray-400 mt-1">Everyone</p>;
  }
  if (audience_type === "event") {
    return <p className="text-xs text-gray-400 mt-1">Current Event</p>;
  }
  // Custom — show all recipient names
  if (audience_names && audience_names.length > 0) {
    return (
      <p className="text-xs text-gray-400 mt-1">
        {audience_names.join(", ")}
      </p>
    );
  }
  return <p className="text-xs text-gray-400 mt-1">Custom</p>;
}

export function AnnouncementManager() {
  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AudienceType>("event");
  const [timing, setTiming] = useState<TimingMode>("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sendingNowId, setSendingNowId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [recipientListOpen, setRecipientListOpen] = useState(false);

  // Custom audience state
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [showSaveList, setShowSaveList] = useState(false);
  const [saveListName, setSaveListName] = useState("");
  const [savingList, setSavingList] = useState(false);
  const [expandedListId, setExpandedListId] = useState<string | null>(null);

  // Data
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [eventParticipantIds, setEventParticipantIds] = useState<string[]>([]);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [tripTimezone, setTripTimezone] = useState("America/New_York");
  const [broadcastLists, setBroadcastLists] = useState<BroadcastList[]>([]);
  const [sentAnnouncements, setSentAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [scheduledAnnouncements, setScheduledAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, tripsRes, listsRes, historyRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/trips?status=active"),
        fetch("/api/admin/broadcast-lists"),
        fetch("/api/admin/announcements"),
      ]);

      const usersData = await usersRes.json();
      const tripsData = await tripsRes.json();
      const listsData = await listsRes.json();
      const historyData = await historyRes.json();

      if (usersData.users) {
        setAllUsers(usersData.users.filter((u: User) => u.is_active));
      }
      if (listsData.lists) setBroadcastLists(listsData.lists);
      if (historyData.sent) setSentAnnouncements(historyData.sent);
      if (historyData.scheduled) setScheduledAnnouncements(historyData.scheduled);

      const activeTrip = tripsData.trip;
      if (activeTrip) {
        setActiveTripId(activeTrip.id);
        if (activeTrip.timezone) setTripTimezone(activeTrip.timezone);
        const participantsRes = await fetch(
          `/api/admin/participants?trip_id=${activeTrip.id}`
        );
        const participantsData = await participantsRes.json();
        if (participantsData.users) {
          const ids = participantsData.users
            .filter((p: { is_participating: boolean }) => p.is_participating)
            .map((p: { id: string }) => p.id);
          setEventParticipantIds(ids);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Resolve the list of users shown for current audience tab
  const getAudienceUsers = (): User[] => {
    if (audience === "everyone") return allUsers;
    if (audience === "event") {
      const idSet = new Set(eventParticipantIds);
      return allUsers.filter((u) => idSet.has(u.id));
    }
    return allUsers.filter((u) => selectedUserIds.has(u.id));
  };

  const getRecipientCount = (): number => {
    if (audience === "everyone") return allUsers.length;
    if (audience === "event") return eventParticipantIds.length;
    return selectedUserIds.size;
  };

  const getRecipientIds = (): string[] => {
    if (audience === "everyone") return allUsers.map((u) => u.id);
    if (audience === "event") return eventParticipantIds;
    return Array.from(selectedUserIds);
  };

  const canSend =
    title.trim() &&
    getRecipientCount() > 0 &&
    (timing === "now" || scheduledFor);

  const handleSend = async () => {
    setShowConfirm(false);
    setSending(true);
    try {
      if (timing === "schedule") {
        const res = await fetch("/api/admin/announcements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            body: body.trim() || null,
            audience_type: audience,
            audience_user_ids: audience === "custom" ? Array.from(selectedUserIds) : undefined,
            trip_id: audience === "event" ? activeTripId : undefined,
            scheduled_for: naiveDatetimeToUTC(scheduledFor, tripTimezone),
          }),
        });
        if (res.ok) {
          showToastMsg("Announcement scheduled!");
          resetForm();
          fetchData();
        } else {
          const err = await res.json();
          showToastMsg(err.error || "Failed to schedule");
        }
      } else {
        const res = await fetch("/api/admin/announcements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            body: body.trim() || null,
            audience_type: audience,
            audience_user_ids: audience === "custom" ? Array.from(selectedUserIds) : undefined,
            trip_id: audience === "event" ? activeTripId : undefined,
            send_now: true,
          }),
        });
        if (res.ok) {
          showToastMsg("Announcement sent!");
          resetForm();
          fetchData();
        } else {
          const err = await res.json();
          showToastMsg(err.error || "Failed to send");
        }
      }
    } catch {
      showToastMsg("Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleCancelScheduled = async (id: string) => {
    const res = await fetch("/api/admin/announcements", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      showToastMsg("Scheduled announcement cancelled");
      fetchData();
    }
  };

  const handleSendNow = async (id: string) => {
    const res = await fetch("/api/admin/announcements", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      showToastMsg("Announcement sent!");
      fetchData();
    }
  };

  const handleDeleteSent = async (id: string) => {
    const res = await fetch("/api/admin/announcements", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      showToastMsg("Announcement deleted");
      fetchData();
    }
  };

  const handleSaveList = async () => {
    if (!saveListName.trim() || selectedUserIds.size === 0) return;
    setSavingList(true);
    try {
      const res = await fetch("/api/admin/broadcast-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveListName.trim(),
          user_ids: Array.from(selectedUserIds),
        }),
      });
      if (res.ok) {
        showToastMsg("List saved!");
        setSaveListName("");
        setShowSaveList(false);
        const listsRes = await fetch("/api/admin/broadcast-lists");
        const listsData = await listsRes.json();
        if (listsData.lists) setBroadcastLists(listsData.lists);
      }
    } catch {
      showToastMsg("Failed to save list");
    } finally {
      setSavingList(false);
    }
  };

  const handleDeleteList = async (id: string) => {
    await fetch("/api/admin/broadcast-lists", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const listsRes = await fetch("/api/admin/broadcast-lists");
    const listsData = await listsRes.json();
    if (listsData.lists) setBroadcastLists(listsData.lists);
  };

  const loadBroadcastList = (list: BroadcastList) => {
    setSelectedUserIds(new Set(list.user_ids));
  };

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const resetForm = () => {
    setTitle("");
    setBody("");
    setAudience("event");
    setTiming("now");
    setScheduledFor("");
    setSelectedUserIds(new Set());
    setRecipientListOpen(false);
  };

  const confirmMessage = () => {
    const count = getRecipientCount();
    const label = count === 1 ? "1 Loozer" : `${count} Loozers`;
    if (timing === "schedule") {
      const utcISO = naiveDatetimeToUTC(scheduledFor, tripTimezone);
      const when = formatInTimezone(utcISO, tripTimezone, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      const tzAbbr = getTimezoneAbbreviation(tripTimezone);
      return `Schedule this announcement for ${label} on ${when} ${tzAbbr}?`;
    }
    return `Send this announcement to ${label} now?`;
  };

  const audienceUsers = getAudienceUsers();
  const recipientCount = getRecipientCount();

  const tabs: { key: AudienceType; label: string; count: number }[] = [
    { key: "event", label: "Current Event", count: eventParticipantIds.length },
    { key: "everyone", label: "Everyone", count: allUsers.length },
    { key: "custom", label: "Custom", count: selectedUserIds.size },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-50 animate-slide-down">
          <div
            className={`rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
              toast.includes("Failed") || toast.includes("cancelled")
                ? "bg-red-600"
                : "bg-green-600"
            }`}
          >
            {toast}
          </div>
        </div>
      )}

      {/* Compose Form */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-4 pt-4 pb-2">
          New Announcement
        </h2>

        {/* Audience Tabs */}
        <div className="flex justify-evenly border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setAudience(tab.key);
                setRecipientListOpen(false);
              }}
              className={`py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors relative ${
                audience === tab.key
                  ? "text-green-700"
                  : "text-gray-400"
              }`}
            >
              {tab.label} ({tab.count})
              {audience === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-600 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Recipient list (collapsible) */}
        <div className="border-b border-gray-100">
          {/* Custom: select recipients button */}
          {audience === "custom" && (
            <button
              onClick={() => setShowUserPicker(true)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-left bg-green-50 border-b border-green-100 active:bg-green-100 transition-colors"
            >
              <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="text-sm font-medium text-green-700">Select Recipients</span>
            </button>
          )}

          {/* Collapsed toggle */}
          <button
            onClick={() => setRecipientListOpen(!recipientListOpen)}
            className="w-full flex items-center justify-between px-4 py-2.5 active:bg-gray-50 transition-colors"
          >
            <span className="text-xs text-gray-500">
              {recipientCount} {recipientCount === 1 ? "recipient" : "recipients"}
            </span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${
                recipientListOpen ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Expanded recipient list */}
          {recipientListOpen && (
            <div className="max-h-48 overflow-y-auto border-t border-gray-50">
              {audienceUsers.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-400">
                  {audience === "custom" ? "No recipients selected" : "No users found"}
                </p>
              ) : audience === "custom" ? (
                <div className="divide-y divide-gray-50">
                  {audienceUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center gap-2.5 px-4 py-2"
                    >
                      <UserAvatar user={user} />
                      <span className="text-sm text-gray-700">
                        {user.display_name}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 px-4 py-2.5">
                  {audienceUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center gap-1.5 bg-gray-50 rounded-full pl-1 pr-2.5 py-1"
                    >
                      <UserAvatar user={user} />
                      <span className="text-xs font-medium text-gray-700">
                        {user.display_name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Custom: saved lists + save controls */}
        {audience === "custom" && (
          <div className="px-4 py-2 border-b border-gray-100 space-y-2">
            {/* Saved lists */}
            {broadcastLists.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-gray-400 font-medium">Saved Lists</p>
                {broadcastLists.map((list) => {
                  const isExpanded = expandedListId === list.id;
                  const listUsers = allUsers.filter((u) =>
                    Array.isArray(list.user_ids) && list.user_ids.includes(u.id)
                  );
                  return (
                    <div key={list.id} className="rounded-lg border border-gray-200 overflow-hidden">
                      <button
                        onClick={() => setExpandedListId(isExpanded ? null : list.id)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left active:bg-gray-50"
                      >
                        <span className="text-xs font-semibold text-gray-700">
                          {list.name}
                          <span className="ml-1 text-gray-400 font-normal">({list.user_count})</span>
                        </span>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-gray-100">
                          <div className="flex flex-wrap gap-1.5 px-3 py-2">
                            {listUsers.map((user) => (
                              <div
                                key={user.id}
                                className="flex items-center gap-1.5 bg-gray-50 rounded-full pl-1 pr-2.5 py-1"
                              >
                                <UserAvatar user={user} />
                                <span className="text-xs font-medium text-gray-700">
                                  {user.display_name}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2 px-3 py-2 border-t border-gray-100">
                            <button
                              onClick={() => { loadBroadcastList(list); setExpandedListId(null); }}
                              className="text-xs font-semibold text-green-700"
                            >
                              Use this list
                            </button>
                            <button
                              onClick={() => handleDeleteList(list.id)}
                              className="text-xs font-semibold text-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Save current selection as a list */}
            {selectedUserIds.size > 0 && (
              !showSaveList ? (
                <button
                  onClick={() => setShowSaveList(true)}
                  className="text-xs text-green-700 font-medium"
                >
                  Save as list
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="List name"
                    autoFocus
                    value={saveListName}
                    onChange={(e) => setSaveListName(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs"
                  />
                  <button
                    onClick={handleSaveList}
                    disabled={!saveListName.trim() || savingList}
                    className="px-2 py-1 bg-green-600 text-white text-xs font-medium rounded-lg disabled:opacity-50"
                  >
                    {savingList ? "..." : "Save"}
                  </button>
                  <button
                    onClick={() => { setShowSaveList(false); setSaveListName(""); }}
                    className="px-2 py-1 text-xs text-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              )
            )}
          </div>
        )}

        {/* Form fields */}
        <div className="p-4 space-y-3">
          <input
            type="text"
            placeholder="Title (required)"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
          />
          <textarea
            placeholder="Body (optional)"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px] resize-none"
          />

          {/* Timing */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">
              When
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setTiming("now")}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  timing === "now"
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                Send Now
              </button>
              <button
                onClick={() => setTiming("schedule")}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  timing === "schedule"
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                Schedule
              </button>
            </div>
          </div>

          {timing === "schedule" && (
            <div>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
              />
              <p className="text-xs text-gray-400 mt-1">
                Times are in {getTimezoneAbbreviation(tripTimezone)}
              </p>
            </div>
          )}

          <button
            onClick={() => setShowConfirm(true)}
            disabled={!canSend || sending}
            className="w-full bg-green-600 text-white rounded-xl py-3 font-semibold text-[15px] active:opacity-80 disabled:opacity-50"
          >
            {sending
              ? timing === "schedule" ? "Scheduling..." : "Sending..."
              : timing === "schedule"
              ? "Schedule Announcement"
              : `Send to ${recipientCount} Loozer${recipientCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      {/* Confirm Send/Schedule Modal */}
      <ConfirmModal
        open={showConfirm}
        title={timing === "schedule" ? "Schedule Announcement" : "Send Announcement"}
        message={confirmMessage()}
        confirmLabel={timing === "schedule" ? "Schedule" : "Send"}
        onConfirm={handleSend}
        onCancel={() => setShowConfirm(false)}
      />

      {/* Confirm Send Now Modal */}
      <ConfirmModal
        open={sendingNowId !== null}
        title="Send Now"
        message="Send this announcement immediately?"
        confirmLabel="Send Now"
        onConfirm={async () => {
          if (sendingNowId) {
            await handleSendNow(sendingNowId);
            setSendingNowId(null);
          }
        }}
        onCancel={() => setSendingNowId(null)}
      />

      {/* Confirm Cancel Modal */}
      <ConfirmModal
        open={cancellingId !== null}
        title="Cancel Announcement"
        message="Are you sure you want to cancel this scheduled announcement?"
        confirmLabel="Cancel Announcement"
        destructive
        onConfirm={async () => {
          if (cancellingId) {
            await handleCancelScheduled(cancellingId);
            setCancellingId(null);
          }
        }}
        onCancel={() => setCancellingId(null)}
      />

      {/* Confirm Delete Sent Modal */}
      <ConfirmModal
        open={deletingId !== null}
        title="Delete Announcement"
        message="Remove this announcement from the sent history?"
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (deletingId) {
            await handleDeleteSent(deletingId);
            setDeletingId(null);
          }
        }}
        onCancel={() => setDeletingId(null)}
      />

      {/* User Picker Drawer */}
      <BottomDrawer
        open={showUserPicker}
        onClose={() => setShowUserPicker(false)}
        title="Select Recipients"
        subtitle={`${selectedUserIds.size} of ${allUsers.length} selected`}
      >
        {/* All / None */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
          <span className="text-xs text-gray-500">
            {selectedUserIds.size} of {allUsers.length}
          </span>
          <div className="flex gap-3">
            <button
              onClick={() => setSelectedUserIds(new Set(allUsers.map((u) => u.id)))}
              className="text-xs font-semibold text-green-700"
            >
              All
            </button>
            <button
              onClick={() => setSelectedUserIds(new Set())}
              className="text-xs font-semibold text-red-600"
            >
              None
            </button>
          </div>
        </div>

        {/* Saved lists quick load */}
        {broadcastLists.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-100 flex gap-2 flex-wrap">
            {broadcastLists.map((list) => (
              <div key={list.id} className="flex items-center gap-1">
                <button
                  onClick={() => loadBroadcastList(list)}
                  className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-medium"
                >
                  {list.name} ({list.user_count})
                </button>
                <button
                  onClick={() => handleDeleteList(list.id)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* User list with checkboxes */}
        <div className="divide-y divide-gray-50">
          {allUsers.map((user) => {
            const selected = selectedUserIds.has(user.id);
            return (
              <button
                key={user.id}
                onClick={() => toggleUser(user.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50 transition-colors"
              >
                <div
                  className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    selected ? "bg-green-600 border-green-600" : "border-gray-300"
                  }`}
                >
                  {selected && (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <UserAvatar user={user} />
                <span className="text-sm font-medium text-gray-900">
                  {user.display_name}
                </span>
              </button>
            );
          })}
        </div>
      </BottomDrawer>

      {/* Scheduled Announcements */}
      {scheduledAnnouncements.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Scheduled
          </h2>
          <div className="space-y-2">
            {scheduledAnnouncements.map((a) => (
              <div
                key={a.id}
                className="bg-white rounded-xl border border-orange-200 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <svg className="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                        {formatScheduledTime(a.scheduled_for, tripTimezone)} {getTimezoneAbbreviation(tripTimezone)}
                      </span>
                    </div>
                    <p className="font-semibold text-sm text-gray-900 truncate">
                      {a.title}
                    </p>
                    {a.body && (
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                        {a.body}
                      </p>
                    )}
                    <AudienceLabel announcement={a} />
                  </div>
                  <div className="flex flex-col justify-between items-end gap-2 flex-shrink-0 self-stretch">
                    <button
                      onClick={() => setSendingNowId(a.id)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700"
                    >
                      Send Now
                    </button>
                    <button
                      onClick={() => setCancellingId(a.id)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sent History */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Sent
        </h2>
        {sentAnnouncements.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-8">
            No announcements sent yet
          </div>
        ) : (
          <div className="space-y-2">
            {sentAnnouncements.map((a) => (
              <div
                key={a.id}
                className="bg-white rounded-xl border border-gray-200 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-gray-900 truncate">
                      {a.title}
                    </p>
                    {a.body && (
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                        {a.body}
                      </p>
                    )}
                    <AudienceLabel announcement={a} />
                  </div>
                  <div className="flex flex-col items-end shrink-0 gap-1">
                    <span className="text-xs text-gray-400">
                      {timeAgo(a.sent_at!)}
                    </span>
                    {a.recipient_count !== undefined && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        {a.recipient_count}{" "}
                        {a.recipient_count === 1 ? "recipient" : "recipients"}
                      </span>
                    )}
                    <button
                      onClick={() => setDeletingId(a.id)}
                      className={BTN_DESTRUCTIVE}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
