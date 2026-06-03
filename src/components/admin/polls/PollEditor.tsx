"use client";

import { useState, useEffect } from "react";
import { ConfirmModal } from "../ConfirmModal";
import { naiveDatetimeToUTC } from "@/lib/utils/timezone";
import type {
  Poll,
  PollAudienceType,
  PollQuestionType,
} from "@/types/golf";

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

interface DraftOption {
  id?: string;
  option_text: string;
}

interface DraftQuestion {
  id?: string;
  question_text: string;
  question_type: PollQuestionType;
  max_selections: number | null;
  max_length: number | null;
  options: DraftOption[];
}

interface PollEditorProps {
  poll?: Poll | null;
  allUsers: User[];
  eventParticipantIds: string[];
  activeTripId: string | null;
  tripTimezone: string;
  onSaved: () => void;
  onCancel: () => void;
}

function emptyQuestion(): DraftQuestion {
  return {
    question_text: "",
    question_type: "single",
    max_selections: null,
    max_length: null,
    options: [{ option_text: "" }, { option_text: "" }],
  };
}

export function PollEditor({
  poll,
  allUsers,
  eventParticipantIds,
  activeTripId,
  tripTimezone,
  onSaved,
  onCancel,
}: PollEditorProps) {
  const isEditing = !!poll;
  const [title, setTitle] = useState(poll?.title || "");
  const [description, setDescription] = useState(poll?.description || "");
  const [audience, setAudience] = useState<PollAudienceType>(
    poll?.audience_type || "event"
  );
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set(poll?.audience_user_ids || [])
  );
  const [isAnonymous, setIsAnonymous] = useState(poll?.is_anonymous || false);
  const [sendNotification, setSendNotification] = useState(
    poll?.send_notification_on_launch ?? true
  );
  const [showResultsWhileOpen, setShowResultsWhileOpen] = useState(
    poll?.show_results_while_open ?? false
  );
  const [questions, setQuestions] = useState<DraftQuestion[]>(
    poll?.questions?.length
      ? poll.questions.map((q) => ({
          id: q.id,
          question_text: q.question_text,
          question_type: q.question_type,
          max_selections: q.max_selections,
          max_length: q.max_length,
          options: q.options.map((o) => ({
            id: o.id,
            option_text: o.option_text,
          })),
        }))
      : [emptyQuestion()]
  );

  const [publishMode, setPublishMode] = useState<"draft" | "now" | "schedule">(
    "draft"
  );
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<{ id: string; title: string; ends_at: string }[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [showAudiencePicker, setShowAudiencePicker] = useState(false);

  const [broadcastLists, setBroadcastLists] = useState<BroadcastList[]>([]);
  const [expandedListId, setExpandedListId] = useState<string | null>(null);
  const [showSaveList, setShowSaveList] = useState(false);
  const [saveListName, setSaveListName] = useState("");
  const [savingList, setSavingList] = useState(false);

  const refreshLists = async () => {
    try {
      const res = await fetch("/api/admin/broadcast-lists");
      if (!res.ok) return;
      const data = await res.json();
      if (data.lists) setBroadcastLists(data.lists);
    } catch {
      // silent — lists are optional
    }
  };

  useEffect(() => {
    refreshLists();
  }, []);

  const handleApplyList = (list: BroadcastList) => {
    setSelectedUserIds(new Set(list.user_ids));
    setExpandedListId(null);
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
        setSaveListName("");
        setShowSaveList(false);
        await refreshLists();
      }
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
    await refreshLists();
  };

  // Pre-populate window for editing scheduled/active polls
  useEffect(() => {
    if (poll?.starts_at) {
      const d = new Date(poll.starts_at);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setStartsAt(local);
    }
    if (poll?.ends_at) {
      const d = new Date(poll.ends_at);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setEndsAt(local);
    }
  }, [poll]);

  const updateQuestion = (idx: number, patch: Partial<DraftQuestion>) => {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const updateOption = (qIdx: number, oIdx: number, value: string) => {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i !== qIdx
          ? q
          : {
              ...q,
              options: q.options.map((o, j) =>
                j === oIdx ? { ...o, option_text: value } : o
              ),
            }
      )
    );
  };

  const addOption = (qIdx: number) => {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i !== qIdx ? q : { ...q, options: [...q.options, { option_text: "" }] }
      )
    );
  };

  const removeOption = (qIdx: number, oIdx: number) => {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i !== qIdx
          ? q
          : { ...q, options: q.options.filter((_, j) => j !== oIdx) }
      )
    );
  };

  const validate = (): string | null => {
    if (!title.trim()) return "Title is required";
    if (audience === "event" && !activeTripId) {
      return "No active event for event audience";
    }
    if (audience === "custom" && selectedUserIds.size === 0) {
      return "Pick at least one Loozer for custom audience";
    }
    if (questions.length === 0) return "At least one question is required";
    for (const q of questions) {
      if (!q.question_text.trim()) return "Every question needs text";
      if (q.question_type === "single" || q.question_type === "multi") {
        if (q.options.length < 2) return "Select questions need at least 2 options";
        for (const o of q.options) {
          if (!o.option_text.trim()) return "Every option needs text";
        }
      }
    }
    if (publishMode === "schedule") {
      if (!startsAt || !endsAt) return "Pick both start and end times";
      if (new Date(endsAt) <= new Date(startsAt)) {
        return "End time must be after start time";
      }
    }
    if (publishMode === "now") {
      if (!endsAt) return "Pick an end time";
    }
    return null;
  };

  const buildPayload = () => ({
    title: title.trim(),
    description: description.trim() || null,
    audience_type: audience,
    audience_user_ids:
      audience === "custom" ? Array.from(selectedUserIds) : null,
    trip_id: audience === "event" ? activeTripId : null,
    is_anonymous: isAnonymous,
    send_notification_on_launch: sendNotification,
    show_results_while_open: showResultsWhileOpen,
    questions: questions.map((q) => ({
      id: q.id,
      question_text: q.question_text.trim(),
      question_type: q.question_type,
      max_selections:
        q.question_type === "multi" ? q.max_selections : null,
      max_length: q.question_type === "text" ? q.max_length : null,
      options:
        q.question_type === "single" || q.question_type === "multi"
          ? q.options.map((o) => ({
              id: o.id,
              option_text: o.option_text.trim(),
            }))
          : [],
    })),
  });

  const persist = async () => {
    setSaving(true);
    setError(null);
    setConflicts([]);

    try {
      let pollId = poll?.id;

      // Create or update the poll body first
      if (!isEditing) {
        const res = await fetch("/api/admin/polls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload()),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to create poll");
          setSaving(false);
          return;
        }
        const data = await res.json();
        pollId = data.poll.id;
      } else {
        const res = await fetch(`/api/admin/polls/${poll!.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload()),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to update poll");
          setSaving(false);
          return;
        }
      }

      // Publish if requested
      if (publishMode !== "draft" && pollId) {
        const startISO =
          publishMode === "now"
            ? new Date().toISOString()
            : naiveDatetimeToUTC(startsAt, tripTimezone);
        const endISO = naiveDatetimeToUTC(endsAt, tripTimezone);
        const res = await fetch(`/api/admin/polls/${pollId}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ starts_at: startISO, ends_at: endISO }),
        });
        if (!res.ok) {
          const data = await res.json();
          if (data.conflicts) setConflicts(data.conflicts);
          setError(data.error || "Failed to publish");
          setSaving(false);
          return;
        }
      }

      onSaved();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setConfirm(true);
  };

  const audienceCount =
    audience === "everyone"
      ? allUsers.length
      : audience === "event"
        ? eventParticipantIds.length
        : selectedUserIds.size;

  const confirmMessage = () => {
    const label = audienceCount === 1 ? "1 Loozer" : `${audienceCount} Loozers`;
    if (publishMode === "draft") return "Save this poll as a draft?";
    if (publishMode === "now") return `Publish this poll to ${label} now?`;
    return `Schedule this poll for ${label}?`;
  };

  const canSubmit = title.trim() && audienceCount > 0 && !saving;

  return (
    <div className="space-y-4 px-4 py-4">
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">Title</label>
        <input
          type="text"
          placeholder="Poll title (shown on home button)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">
          Description (optional)
        </label>
        <textarea
          placeholder="Optional context shown above the question(s)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px] resize-none"
        />
      </div>

      {/* Audience */}
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">Audience</label>
        <div className="flex gap-2 flex-wrap">
          {(
            [
              { key: "event", label: `Current Event (${eventParticipantIds.length})` },
              { key: "everyone", label: `Everyone (${allUsers.length})` },
              { key: "custom", label: `Custom (${selectedUserIds.size})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setAudience(tab.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                audience === tab.key
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {audience === "custom" && (
          <div className="mt-2 space-y-2">
            {broadcastLists.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-gray-400 font-medium">Saved lists</p>
                {broadcastLists.map((list) => {
                  const isExpanded = expandedListId === list.id;
                  const listUsers = allUsers.filter((u) =>
                    Array.isArray(list.user_ids) && list.user_ids.includes(u.id)
                  );
                  return (
                    <div
                      key={list.id}
                      className="rounded-lg border border-gray-200 overflow-hidden"
                    >
                      <button
                        onClick={() =>
                          setExpandedListId(isExpanded ? null : list.id)
                        }
                        className="w-full flex items-center justify-between px-3 py-2 text-left active:bg-gray-50"
                      >
                        <span className="text-xs font-semibold text-gray-700">
                          {list.name}
                          <span className="ml-1 text-gray-400 font-normal">
                            ({list.user_count})
                          </span>
                        </span>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-gray-100">
                          <div className="flex flex-wrap gap-1.5 px-3 py-2">
                            {listUsers.map((u) => (
                              <span
                                key={u.id}
                                className="text-[11px] font-medium text-gray-700 bg-gray-50 rounded-full px-2 py-0.5"
                              >
                                {u.display_name}
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-3 px-3 py-2 border-t border-gray-100">
                            <button
                              onClick={() => handleApplyList(list)}
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

            {selectedUserIds.size > 0 &&
              (!showSaveList ? (
                <button
                  onClick={() => setShowSaveList(true)}
                  className="text-xs text-green-700 font-medium"
                >
                  Save current selection as a list
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
                    onClick={() => {
                      setShowSaveList(false);
                      setSaveListName("");
                    }}
                    className="px-2 py-1 text-xs text-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              ))}

            <button
              onClick={() => setShowAudiencePicker(!showAudiencePicker)}
              className="text-xs text-green-700 font-medium"
            >
              {showAudiencePicker ? "Hide" : "Pick recipients"}
            </button>
          </div>
        )}
        {audience === "custom" && showAudiencePicker && (
          <div className="mt-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {allUsers.map((u) => {
              const checked = selectedUserIds.has(u.id);
              return (
                <button
                  key={u.id}
                  onClick={() => {
                    setSelectedUserIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(u.id)) next.delete(u.id);
                      else next.add(u.id);
                      return next;
                    });
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 active:bg-gray-50 text-left"
                >
                  <div
                    className={`w-4 h-4 rounded border ${
                      checked
                        ? "bg-green-600 border-green-600"
                        : "border-gray-300"
                    } flex items-center justify-center`}
                  >
                    {checked && (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-gray-800">{u.display_name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Toggles */}
      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm text-gray-700">
            Anonymous (results show counts only)
          </span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={sendNotification}
            onChange={(e) => setSendNotification(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm text-gray-700">
            Send a push notification when this poll launches
          </span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showResultsWhileOpen}
            onChange={(e) => setShowResultsWhileOpen(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm text-gray-700">
            Show live results to voters after they submit
          </span>
        </label>
      </div>

      {/* Questions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-500">Questions</label>
          <button
            onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}
            className="text-xs text-green-700 font-medium"
          >
            + Add question
          </button>
        </div>

        {questions.map((q, qIdx) => (
          <div
            key={qIdx}
            className="border border-gray-200 rounded-lg p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <input
                type="text"
                placeholder={`Question ${qIdx + 1}`}
                value={q.question_text}
                onChange={(e) =>
                  updateQuestion(qIdx, { question_text: e.target.value })
                }
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-[15px]"
              />
              {questions.length > 1 && (
                <button
                  onClick={() =>
                    setQuestions((qs) => qs.filter((_, i) => i !== qIdx))
                  }
                  className="text-xs text-red-600 px-2 py-2"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              {(["single", "multi", "text"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => updateQuestion(qIdx, { question_type: t })}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    q.question_type === t
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {t === "single"
                    ? "Pick one"
                    : t === "multi"
                      ? "Pick many"
                      : "Free text"}
                </button>
              ))}
            </div>

            {q.question_type === "multi" && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">
                  Max selections (blank = unlimited)
                </label>
                <input
                  type="number"
                  min={1}
                  value={q.max_selections ?? ""}
                  onChange={(e) =>
                    updateQuestion(qIdx, {
                      max_selections: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  className="w-16 border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </div>
            )}

            {(q.question_type === "single" || q.question_type === "multi") && (
              <div className="space-y-1.5">
                {q.options.map((o, oIdx) => (
                  <div key={oIdx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Option ${oIdx + 1}`}
                      value={o.option_text}
                      onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    />
                    {q.options.length > 2 && (
                      <button
                        onClick={() => removeOption(qIdx, oIdx)}
                        className="text-xs text-red-600 px-2"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => addOption(qIdx)}
                  className="text-xs text-green-700 font-medium"
                >
                  + Add option
                </button>
              </div>
            )}

            {q.question_type === "text" && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Max length</label>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={q.max_length ?? 500}
                  onChange={(e) =>
                    updateQuestion(qIdx, {
                      max_length: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Publishing — only on create or draft polls */}
      {(!isEditing || poll?.status === "draft") && (
        <div className="space-y-2 pt-2 border-t border-gray-100">
          <label className="text-xs font-medium text-gray-500">
            When to publish
          </label>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { key: "draft", label: "Save as draft" },
                { key: "now", label: "Publish now" },
                { key: "schedule", label: "Schedule" },
              ] as const
            ).map((m) => (
              <button
                key={m.key}
                onClick={() => setPublishMode(m.key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                  publishMode === m.key
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {publishMode === "schedule" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Starts at ({tripTimezone})
              </label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
              />
            </div>
          )}
          {publishMode !== "draft" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Ends at ({tripTimezone})
              </label>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
              />
            </div>
          )}
        </div>
      )}

      {/* Errors / conflicts */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 space-y-1">
          <p className="font-semibold">Conflicting polls:</p>
          {conflicts.map((c) => (
            <p key={c.id}>
              &ldquo;{c.title}&rdquo; runs until{" "}
              {new Date(c.ends_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-1 bg-green-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
        >
          {saving
            ? "Saving..."
            : isEditing && poll?.status !== "draft"
              ? "Save changes"
              : publishMode === "draft"
                ? "Save draft"
                : publishMode === "now"
                  ? "Publish now"
                  : "Schedule"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-3 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600"
        >
          Cancel
        </button>
      </div>

      <ConfirmModal
        open={confirm}
        title="Confirm"
        message={confirmMessage()}
        confirmLabel={
          publishMode === "now"
            ? "Publish"
            : publishMode === "schedule"
              ? "Schedule"
              : "Save"
        }
        onConfirm={() => {
          setConfirm(false);
          persist();
        }}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
