"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import type { NameMode } from "@/lib/v2/profile";
import styles from "@/app/new/new.module.css";

type Audience = "everyone" | "event" | "custom";
type Status = "pending" | "sent" | "cancelled";

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  audience_type: Audience;
  audience_user_ids: string[] | null;
  event_id: string | null;
  scheduled_for: string | null;
  status: Status;
  recipient_count: number | null;
  created_at: string;
  sent_at: string | null;
}
interface MemberLite {
  user_id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
}
interface EventLite {
  id: string;
  name: string;
  year: number | null;
  status: string;
}

/** ISO → value for <input type="datetime-local"> in the viewer's local zone. */
function toLocalInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000); // default +1h
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function memberSortKey(m: MemberLite, mode: NameMode): string {
  const k =
    mode === "real"
      ? (m.last_name || "").trim() || (m.first_name || "").trim() || m.display_name
      : (m.nickname || "").trim() || m.display_name;
  return k.toLowerCase();
}

export default function AnnouncementManager({
  orgId,
  nameMode,
}: {
  orgId: string;
  nameMode: NameMode;
}) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [events, setEvents] = useState<EventLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0);
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Composer fields.
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState("");
  const [audience, setAudience] = useState<Audience>("everyone");
  const [eventId, setEventId] = useState<string>("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [memberQuery, setMemberQuery] = useState("");
  const [timing, setTiming] = useState<"now" | "schedule">("now");
  const [scheduleAt, setScheduleAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; title: string } | null>(null);

  const fetchAll = useCallback(async () => {
    const r = await fetch(`/api/v2/announcements?orgId=${orgId}`);
    if (!r.ok) return { announcements: [], members: [], events: [] };
    return r.json();
  }, [orgId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const data = await fetchAll();
      if (!active) return;
      setNow(Date.now());
      setAnnouncements(data.announcements || []);
      setMembers(data.members || []);
      setEvents(data.events || []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [fetchAll]);

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => memberSortKey(a, nameMode).localeCompare(memberSortKey(b, nameMode))),
    [members, nameMode],
  );
  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return sortedMembers;
    return sortedMembers.filter((m) =>
      [m.display_name, m.first_name, m.last_name, m.nickname].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [sortedMembers, memberQuery]);

  const eventName = useCallback(
    (id: string | null) => {
      if (!id) return "an event";
      const e = events.find((ev) => ev.id === id);
      return e ? `${e.name}${e.year ? ` ${e.year}` : ""}` : "an event";
    },
    [events],
  );

  function resetComposer() {
    setTitle("");
    setMsg("");
    setAudience("everyone");
    setEventId(events[0]?.id || "");
    setPicked(new Set());
    setMemberQuery("");
    setTiming("now");
    setScheduleAt(toLocalInput(null));
    setError(null);
    setEditingId(null);
  }

  function openNew() {
    resetComposer();
    setComposing(true);
  }

  function openEdit(a: Announcement) {
    setTitle(a.title);
    setMsg(a.body || "");
    setAudience(a.audience_type);
    setEventId(a.event_id || events[0]?.id || "");
    setPicked(new Set(a.audience_user_ids || []));
    setMemberQuery("");
    setTiming(a.scheduled_for ? "schedule" : "now");
    setScheduleAt(toLocalInput(a.scheduled_for));
    setError(null);
    setEditingId(a.id);
    setComposing(true);
  }

  function toggleMember(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function validate(): string | null {
    if (!title.trim()) return "A title is required.";
    if (audience === "event" && !eventId) return "Pick an event.";
    if (audience === "custom" && picked.size === 0) return "Pick at least one member.";
    if (timing === "schedule") {
      if (!scheduleAt) return "Pick a date and time.";
      if (new Date(scheduleAt).getTime() <= Date.now()) return "Scheduled time must be in the future.";
    }
    return null;
  }

  async function save() {
    if (busy) return;
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      orgId,
      title: title.trim(),
      body: msg,
      audience_type: audience,
      audience_user_ids: audience === "custom" ? [...picked] : undefined,
      event_id: audience === "event" ? eventId : null,
      scheduled_for: timing === "schedule" ? new Date(scheduleAt).toISOString() : null,
      send_now: timing === "now",
    };
    const res = editingId
      ? await fetch(`/api/v2/announcements/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/v2/announcements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Could not save");
      return;
    }
    setComposing(false);
    const data = await fetchAll();
    setAnnouncements(data.announcements || []);
  }

  async function sendPending(id: string) {
    const res = await fetch(`/api/v2/announcements/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send" }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Could not send");
      return;
    }
    const data = await fetchAll();
    setAnnouncements(data.announcements || []);
  }

  async function remove(id: string) {
    const res = await fetch(`/api/v2/announcements/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Could not delete");
      return;
    }
    const data = await fetchAll();
    setAnnouncements(data.announcements || []);
  }

  function audienceLabel(a: Announcement): string {
    if (a.audience_type === "everyone") return "Everyone";
    if (a.audience_type === "event") return eventName(a.event_id);
    const n = a.audience_user_ids?.length || 0;
    return `${n} member${n === 1 ? "" : "s"}`;
  }

  function whenLabel(a: Announcement): string {
    if (a.status === "sent" && a.sent_at) {
      const d = new Date(a.sent_at);
      const rc = a.recipient_count != null ? ` · ${a.recipient_count} notified` : "";
      return `Sent ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}${rc}`;
    }
    if (a.status === "cancelled") return "Cancelled";
    if (a.scheduled_for) {
      const d = new Date(a.scheduled_for);
      const past = d.getTime() <= now;
      return `${past ? "Sending" : "Scheduled"} ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    }
    return "Draft";
  }

  // ── Composer ────────────────────────────────────────────────────────────
  if (composing) {
    return (
      <>
        <button type="button" className={styles.back} onClick={() => setComposing(false)}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
          </svg>
          All announcements
        </button>
        <h1 className={styles.title}>{editingId ? "Edit announcement" : "New announcement"}</h1>

        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className={styles.field}>
            <label className={styles.label}>Title</label>
            <input
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="What's happening?"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              Message <span className={styles.optional}>(optional)</span>
            </label>
            <textarea
              className={styles.textarea}
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              rows={5}
              placeholder="Add details for the notification body…"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Send to</label>
            <div className={styles.segmented} style={{ alignSelf: "flex-start" }}>
              {(["everyone", "event", "custom"] as Audience[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  className={styles.segmentBtn}
                  data-on={audience === a ? "" : undefined}
                  onClick={() => setAudience(a)}
                  disabled={a === "event" && events.length === 0}
                >
                  {a === "everyone" ? "Everyone" : a === "event" ? "Event" : "Pick members"}
                </button>
              ))}
            </div>

            {audience === "event" && (
              <select
                className={styles.roleSelect}
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                style={{ marginTop: 10 }}
              >
                {events.length === 0 && <option value="">No events yet</option>}
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                    {ev.year ? ` ${ev.year}` : ""}
                    {ev.status === "active" ? " (active)" : ""}
                  </option>
                ))}
              </select>
            )}

            {audience === "custom" && (
              <div style={{ marginTop: 10 }}>
                <input
                  className={styles.input}
                  type="search"
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  placeholder={`Search members (${picked.size} selected)`}
                  aria-label="Search members"
                />
                <div
                  style={{
                    marginTop: 8,
                    maxHeight: 260,
                    overflowY: "auto",
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                  }}
                >
                  {filteredMembers.map((m) => (
                    <label key={m.user_id} className={styles.permRow} style={{ padding: "10px 12px" }}>
                      <input type="checkbox" checked={picked.has(m.user_id)} onChange={() => toggleMember(m.user_id)} />
                      <span className={styles.permText}>
                        <span className={styles.permLabel}>{m.display_name}</span>
                      </span>
                    </label>
                  ))}
                  {filteredMembers.length === 0 && (
                    <p className={styles.dnsHint} style={{ margin: 12 }}>
                      No members match.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label}>When</label>
            <div className={styles.segmented} style={{ alignSelf: "flex-start" }}>
              {(["now", "schedule"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={styles.segmentBtn}
                  data-on={timing === t ? "" : undefined}
                  onClick={() => setTiming(t)}
                >
                  {t === "now" ? "Send now" : "Schedule"}
                </button>
              ))}
            </div>
            {timing === "schedule" && (
              <input
                className={styles.input}
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                style={{ marginTop: 10 }}
              />
            )}
            <p className={styles.swatchHint}>
              {timing === "now"
                ? "Delivers a notification (and push) to everyone in the audience right away."
                : "Held until the scheduled time, then delivered automatically."}
            </p>
          </div>

          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.memberEditActions}>
            <button type="submit" className={styles.createBtn} disabled={busy}>
              {busy
                ? "Working…"
                : timing === "now"
                  ? editingId
                    ? "Send now"
                    : "Send announcement"
                  : editingId
                    ? "Save schedule"
                    : "Schedule announcement"}
            </button>
          </div>
        </form>
      </>
    );
  }

  // ── List ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Announcements</h1>
        <button type="button" className={styles.circleAdd} aria-label="New announcement" onClick={openNew}>
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {error && <p className={styles.formError}>{error}</p>}

      <div className={styles.section}>
        <p className={styles.sectionLabel}>History ({announcements.length})</p>
        {loading ? (
          <p className={styles.dnsHint} style={{ marginTop: 0 }}>Loading…</p>
        ) : announcements.length === 0 ? (
          <p className={styles.dnsHint} style={{ marginTop: 0 }}>
            No announcements yet. Tap + above to send one.
          </p>
        ) : (
          <ul className={styles.memberList}>
            {announcements.map((a) => {
              const scheduled = a.status === "pending";
              return (
                <li key={a.id} className={styles.memberRow} style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
                  <div className={styles.memberMeta}>
                    <span className={styles.memberName}>{a.title}</span>
                    <span className={styles.memberSub}>
                      {audienceLabel(a)} — {whenLabel(a)}
                    </span>
                    {a.body && (
                      <span className={styles.memberSub} style={{ opacity: 0.75 }}>
                        {a.body.length > 100 ? `${a.body.slice(0, 100)}…` : a.body}
                      </span>
                    )}
                  </div>
                  {scheduled && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" className={styles.createBtnGhost} style={{ padding: "6px 12px" }} onClick={() => sendPending(a.id)}>
                        Send now
                      </button>
                      <button type="button" className={styles.createBtnGhost} style={{ padding: "6px 12px" }} onClick={() => openEdit(a)}>
                        Edit
                      </button>
                      <button type="button" className={styles.removeBtn} onClick={() => setConfirm({ id: a.id, title: a.title })}>
                        Delete
                      </button>
                    </div>
                  )}
                  {!scheduled && (
                    <div>
                      <button type="button" className={styles.removeBtn} onClick={() => setConfirm({ id: a.id, title: a.title })}>
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmModal
        open={!!confirm}
        title="Delete announcement?"
        message={
          <>
            Delete &ldquo;{confirm?.title}&rdquo;? If it was already sent, the delivered notifications will be
            removed from members&rsquo; inboxes too.
          </>
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c) remove(c.id);
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
