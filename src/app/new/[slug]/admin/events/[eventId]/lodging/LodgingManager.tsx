"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Modal from "@/app/new/_components/Modal";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import {
  PROPERTY_KINDS,
  BED_TYPES,
  type LodgingProperty,
  type LodgingRoom,
  type LodgingAssignment,
  type LodgingImage,
} from "@/lib/v2/lodging";
import styles from "@/app/new/new.module.css";
import ui from "./lodging.module.css";

export interface RosterMember {
  user_id: string;
  name: string;
  avatar_url: string | null;
  allergies: string | null;
}

const ROOM_FLAGS = [
  { key: "smoking", label: "Smoking" },
  { key: "pet_friendly", label: "Pets OK" },
  { key: "accessible", label: "Accessible" },
  { key: "private_bath", label: "Private bath" },
] as const;

/** Room sort options. "Non-smoking"/"No pets" first serve the allergy use case. */
const SORTS = [
  { key: "number", label: "Room number" },
  { key: "floor", label: "Floor" },
  { key: "availability", label: "Open rooms first" },
  { key: "non_smoking", label: "Non-smoking first" },
  { key: "no_pets", label: "No pets first" },
  { key: "accessible", label: "Accessible first" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

const emptyProp = { name: "", kind: "", address: "", listing_url: "", notes: "" };
const emptyRoom = {
  label: "",
  floor: "",
  bed_type: "",
  bed_count: "",
  capacity: "",
  smoking: false,
  pet_friendly: false,
  accessible: false,
  private_bath: false,
  notes: "",
};

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "?";
}

function roomAttrs(r: LodgingRoom): string {
  const parts: string[] = [];
  if (r.bed_type) parts.push(r.bed_count && r.bed_count > 1 ? `${r.bed_count} ${r.bed_type}` : r.bed_type);
  else if (r.bed_count) parts.push(`${r.bed_count} beds`);
  if (r.floor) parts.push(`Floor ${r.floor}`);
  if (r.capacity) parts.push(`Sleeps ${r.capacity}`);
  if (r.smoking) parts.push("Smoking");
  if (r.pet_friendly) parts.push("Pets OK");
  if (r.accessible) parts.push("Accessible");
  if (r.private_bath) parts.push("Private bath");
  return parts.join(", ");
}

export default function LodgingManager({
  slug,
  orgId,
  eventId,
  eventName,
  initialProperties,
  initialRooms,
  initialAssignments,
  members,
}: {
  slug: string;
  orgId: string;
  eventId: string;
  eventName: string;
  initialProperties: LodgingProperty[];
  initialRooms: LodgingRoom[];
  initialAssignments: LodgingAssignment[];
  members: RosterMember[];
}) {
  const api = `/api/v2/orgs/${orgId}/events/${eventId}/lodging`;

  const [properties, setProperties] = useState<LodgingProperty[]>(initialProperties);
  const [rooms, setRooms] = useState<LodgingRoom[]>(initialRooms);
  const [assignments, setAssignments] = useState<LodgingAssignment[]>(initialAssignments);
  const [err, setErr] = useState<string | null>(null);

  // Modal / drawer state
  const [editProp, setEditProp] = useState<LodgingProperty | "new" | null>(null);
  const [propForm, setPropForm] = useState({ ...emptyProp });
  const [editRoom, setEditRoom] = useState<{ mode: "new"; propertyId: string } | { mode: "edit"; room: LodgingRoom } | null>(null);
  const [roomForm, setRoomForm] = useState({ ...emptyRoom });
  const [assignRoom, setAssignRoom] = useState<LodgingRoom | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ kind: "property" | "room" | "clearAll"; id?: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Room sort — persisted per event so the admin's choice sticks across visits.
  const [sortKey, setSortKey] = useState<SortKey>("number");
  useEffect(() => {
    // Load after hydration (not a lazy initializer) to avoid an SSR mismatch.
    const s = localStorage.getItem(`v2lodgingsort:${eventId}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (s && SORTS.some((x) => x.key === s)) setSortKey(s as SortKey);
  }, [eventId]);
  useEffect(() => {
    localStorage.setItem(`v2lodgingsort:${eventId}`, sortKey);
  }, [eventId, sortKey]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const roomsByProperty = useMemo(() => {
    const m = new Map<string, LodgingRoom[]>();
    for (const r of rooms) (m.get(r.property_id) || m.set(r.property_id, []).get(r.property_id)!).push(r);
    return m;
  }, [rooms]);
  const occupantsByRoom = useMemo(() => {
    const m = new Map<string, RosterMember[]>();
    for (const a of assignments) {
      const mem = memberById.get(a.user_id);
      if (mem) (m.get(a.room_id) || m.set(a.room_id, []).get(a.room_id)!).push(mem);
    }
    for (const list of m.values()) list.sort((x, y) => x.name.localeCompare(y.name));
    return m;
  }, [assignments, memberById]);
  const roomOfUser = useMemo(() => new Map(assignments.map((a) => [a.user_id, a.room_id])), [assignments]);
  const unassignedCount = members.filter((m) => !roomOfUser.has(m.user_id)).length;

  /* ── Property actions ─────────────────────────────────────────────────────── */
  function openNewProp() {
    setPropForm({ ...emptyProp });
    setErr(null);
    setEditProp("new");
  }
  function openEditProp(p: LodgingProperty) {
    setPropForm({ name: p.name, kind: p.kind || "", address: p.address || "", listing_url: p.listing_url || "", notes: p.notes || "" });
    setErr(null);
    setEditProp(p);
  }
  async function saveProp(e: React.FormEvent) {
    e.preventDefault();
    if (!propForm.name.trim() || busy) return;
    setBusy(true);
    setErr(null);
    const isNew = editProp === "new";
    const payload = {
      name: propForm.name.trim(),
      kind: propForm.kind || null,
      address: propForm.address.trim() || null,
      listing_url: propForm.listing_url.trim() || null,
      notes: propForm.notes.trim() || null,
    };
    const res = await fetch(isNew ? `${api}/properties` : `${api}/properties/${(editProp as LodgingProperty).id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "Could not save");
      return;
    }
    const { property } = await res.json();
    setProperties((prev) => (isNew ? [...prev, property] : prev.map((x) => (x.id === property.id ? { ...property } : x))));
    if (isNew) openEditProp(property); // keep open so photos can be added immediately
    else setEditProp(null);
  }
  async function deleteProp(id: string) {
    setProperties((prev) => prev.filter((p) => p.id !== id));
    setRooms((prev) => prev.filter((r) => r.property_id !== id));
    await fetch(`${api}/properties/${id}`, { method: "DELETE" });
  }

  /* ── Image actions ────────────────────────────────────────────────────────── */
  async function uploadImage(file: File) {
    if (editProp === "new" || !editProp) return;
    const propertyId = editProp.id;
    setUploading(true);
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${api}/properties/${propertyId}/images`, { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "Upload failed");
      return;
    }
    const { image } = (await res.json()) as { image: LodgingImage };
    setProperties((prev) => prev.map((p) => (p.id === propertyId ? { ...p, images: [...(p.images || []), image] } : p)));
    setEditProp((cur) => (cur && cur !== "new" && cur.id === propertyId ? { ...cur, images: [...(cur.images || []), image] } : cur));
  }
  async function deleteImage(propertyId: string, imageId: string) {
    setProperties((prev) => prev.map((p) => (p.id === propertyId ? { ...p, images: (p.images || []).filter((i) => i.id !== imageId) } : p)));
    setEditProp((cur) => (cur && cur !== "new" && cur.id === propertyId ? { ...cur, images: (cur.images || []).filter((i) => i.id !== imageId) } : cur));
    await fetch(`${api}/images/${imageId}`, { method: "DELETE" });
  }

  /* ── Room actions ─────────────────────────────────────────────────────────── */
  function openNewRoom(propertyId: string) {
    setRoomForm({ ...emptyRoom });
    setErr(null);
    setEditRoom({ mode: "new", propertyId });
  }
  function openEditRoom(r: LodgingRoom) {
    setRoomForm({
      label: r.label,
      floor: r.floor || "",
      bed_type: r.bed_type || "",
      bed_count: r.bed_count != null ? String(r.bed_count) : "",
      capacity: r.capacity != null ? String(r.capacity) : "",
      smoking: r.smoking,
      pet_friendly: r.pet_friendly,
      accessible: r.accessible,
      private_bath: r.private_bath,
      notes: r.notes || "",
    });
    setErr(null);
    setEditRoom({ mode: "edit", room: r });
  }
  async function saveRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!roomForm.label.trim() || busy || !editRoom) return;
    setBusy(true);
    setErr(null);
    const payload = {
      label: roomForm.label.trim(),
      floor: roomForm.floor.trim() || null,
      bed_type: roomForm.bed_type || null,
      bed_count: roomForm.bed_count === "" ? null : Number(roomForm.bed_count),
      capacity: roomForm.capacity === "" ? null : Number(roomForm.capacity),
      smoking: roomForm.smoking,
      pet_friendly: roomForm.pet_friendly,
      accessible: roomForm.accessible,
      private_bath: roomForm.private_bath,
      notes: roomForm.notes.trim() || null,
    };
    const isNew = editRoom.mode === "new";
    const url = editRoom.mode === "new" ? `${api}/rooms` : `${api}/rooms/${editRoom.room.id}`;
    const body = editRoom.mode === "new" ? { ...payload, property_id: editRoom.propertyId } : payload;
    const res = await fetch(url, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "Could not save");
      return;
    }
    const { room } = await res.json();
    setRooms((prev) => (isNew ? [...prev, room] : prev.map((x) => (x.id === room.id ? room : x))));
    setEditRoom(null);
  }
  async function deleteRoom(id: string) {
    setRooms((prev) => prev.filter((r) => r.id !== id));
    setAssignments((prev) => prev.filter((a) => a.room_id !== id));
    await fetch(`${api}/rooms/${id}`, { method: "DELETE" });
  }

  /* ── Assignment actions ───────────────────────────────────────────────────── */
  async function assignMember(roomId: string, userId: string) {
    // optimistic: move the user to this room
    setAssignments((prev) => {
      const without = prev.filter((a) => a.user_id !== userId);
      return [...without, { id: `tmp-${userId}`, room_id: roomId, user_id: userId }];
    });
    const res = await fetch(`${api}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: roomId, user_id: userId }),
    });
    if (res.ok) {
      const { assignment } = await res.json();
      setAssignments((prev) => prev.map((a) => (a.user_id === userId ? assignment : a)));
    }
  }
  async function unassignMember(userId: string) {
    setAssignments((prev) => prev.filter((a) => a.user_id !== userId));
    await fetch(`${api}/assignments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
  }
  async function clearAll() {
    setAssignments([]);
    await fetch(`${api}/assignments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
  }

  function sortRooms(list: LodgingRoom[]): LodgingRoom[] {
    const byNumber = (a: LodgingRoom, b: LodgingRoom) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
    const occ = (id: string) => occupantsByRoom.get(id)?.length ?? 0;
    const copy = [...list];
    switch (sortKey) {
      case "floor":
        return copy.sort((a, b) => (a.floor || "￿").localeCompare(b.floor || "￿", undefined, { numeric: true }) || byNumber(a, b));
      case "availability":
        return copy.sort((a, b) => occ(a.id) - occ(b.id) || byNumber(a, b));
      case "non_smoking":
        return copy.sort((a, b) => Number(a.smoking) - Number(b.smoking) || byNumber(a, b));
      case "no_pets":
        return copy.sort((a, b) => Number(a.pet_friendly) - Number(b.pet_friendly) || byNumber(a, b));
      case "accessible":
        return copy.sort((a, b) => Number(b.accessible) - Number(a.accessible) || byNumber(a, b));
      default:
        return copy.sort(byNumber);
    }
  }

  const assignRoomOccupants = assignRoom ? occupantsByRoom.get(assignRoom.id) || [] : [];

  return (
    <>
      <Link href={`/new/${slug}/admin/events/${eventId}`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        {eventName}
      </Link>

      <div className={styles.schedTitleRow}>
        <h1 className={styles.title}>Lodging</h1>
        <button type="button" className={styles.circleAdd} aria-label="Add property" onClick={openNewProp}>
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      <p className={styles.lede} style={{ marginTop: 6 }}>
        Add each place the group is staying (a hotel, or a rental), its rooms, and who sleeps where. Turn the Rooms
        feature on under Features to show this to members.
      </p>

      {members.length > 0 && unassignedCount > 0 && (
        <div className={ui.warn}>
          {unassignedCount} {unassignedCount === 1 ? "person is" : "people are"} not assigned to a room yet.
        </div>
      )}

      {err && <p className={styles.formError}>{err}</p>}

      {rooms.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
          <label htmlFor="lodgingSort" className={styles.label} style={{ margin: 0, flex: "none" }}>Sort rooms</label>
          <select
            id="lodgingSort"
            className={styles.selectInput}
            style={{ width: "auto", flex: "1 1 auto" }}
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      )}

      {properties.length === 0 ? (
        <p className={ui.emptyHint}>No properties yet. Add the hotel or rental the group is staying in to get started.</p>
      ) : (
        properties.map((p) => {
          const prooms = sortRooms(roomsByProperty.get(p.id) || []);
          const kindLabel = PROPERTY_KINDS.find((k) => k.key === p.kind)?.label;
          return (
            <div key={p.id} className={ui.propCard}>
              <div className={ui.propHead}>
                <div className={ui.propTitleWrap}>
                  <h2 className={ui.propTitle}>
                    {p.name}
                    {kindLabel && <span className={ui.propKind}>{kindLabel}</span>}
                  </h2>
                  {p.address && <p className={ui.propMeta}>{p.address}</p>}
                  {p.listing_url && (
                    <p className={ui.propMeta}>
                      <a className={ui.propLink} href={p.listing_url} target="_blank" rel="noopener noreferrer">
                        View listing
                      </a>
                    </p>
                  )}
                  {p.notes && <p className={ui.propMeta}>{p.notes}</p>}
                </div>
                <button type="button" className={ui.iconBtn} aria-label="Edit property" onClick={() => openEditProp(p)}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 4H4v16h16v-7M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              </div>

              {(p.images || []).length > 0 && (
                <div className={ui.thumbRow}>
                  {(p.images || []).map((img) => (
                    <a key={img.id} className={ui.thumb} href={img.url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={img.caption || "Floorplan"} />
                      {img.caption && <span className={ui.thumbCap}>{img.caption}</span>}
                    </a>
                  ))}
                </div>
              )}

              <div className={ui.roomList}>
                {prooms.length === 0 ? (
                  <p className={ui.emptyHint}>No rooms yet.</p>
                ) : (
                  prooms.map((r) => {
                    const occ = occupantsByRoom.get(r.id) || [];
                    const over = r.capacity != null && occ.length > r.capacity;
                    const attrs = roomAttrs(r);
                    return (
                      <div key={r.id} className={ui.roomRow}>
                        <button type="button" className={ui.roomMain} onClick={() => openEditRoom(r)}>
                          <span className={ui.roomLabel}>{r.label}</span>
                          {attrs && <span className={ui.roomAttrs} style={{ display: "block" }}>{attrs}</span>}
                          {occ.length > 0 && (
                            <span className={ui.occupants}>
                              {occ.map((m) => (
                                <span key={m.user_id} className={ui.occ}>
                                  {m.avatar_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className={ui.occAvatar} src={m.avatar_url} alt="" />
                                  ) : (
                                    <span className={ui.avatarFallback}>{initials(m.name)}</span>
                                  )}
                                  {m.name}
                                </span>
                              ))}
                            </span>
                          )}
                          {over && <span className={ui.roomAttrs} style={{ display: "block" }}><span className={ui.capWarn}>Over capacity</span></span>}
                        </button>
                        <button
                          type="button"
                          className={ui.iconBtn}
                          aria-label={`Assign people to ${r.label}`}
                          onClick={() => setAssignRoom(r)}
                        >
                          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6" />
                          </svg>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <button type="button" className={ui.addRoomBtn} onClick={() => openNewRoom(p.id)}>
                + Add room
              </button>
            </div>
          );
        })
      )}

      {assignments.length > 0 && (
        <button
          type="button"
          className={styles.deleteBtn}
          style={{ marginTop: 20 }}
          onClick={() => setConfirmDel({ kind: "clearAll", label: "all room assignments" })}
        >
          Clear all assignments
        </button>
      )}

      {/* ── Property modal ─────────────────────────────────────────────────────── */}
      <Modal open={editProp !== null} title={editProp === "new" ? "New property" : "Edit property"} onClose={() => setEditProp(null)}>
        <form className={styles.form} onSubmit={saveProp}>
          <div className={styles.field}>
            <label className={styles.label}>Name</label>
            <input className={styles.input} value={propForm.name} onChange={(e) => setPropForm({ ...propForm, name: e.target.value })} placeholder="e.g. The Grand Hotel, Lake House" maxLength={120} autoFocus />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Type <span className={styles.optional}>(optional)</span></label>
            <select className={styles.selectInput} value={propForm.kind} onChange={(e) => setPropForm({ ...propForm, kind: e.target.value })}>
              <option value="">Not specified</option>
              {PROPERTY_KINDS.map((k) => (
                <option key={k.key} value={k.key}>{k.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Address <span className={styles.optional}>(optional)</span></label>
            <input className={styles.input} value={propForm.address} onChange={(e) => setPropForm({ ...propForm, address: e.target.value })} placeholder="Street, city, state" maxLength={300} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Listing link <span className={styles.optional}>(optional)</span></label>
            <input className={styles.input} type="url" value={propForm.listing_url} onChange={(e) => setPropForm({ ...propForm, listing_url: e.target.value })} placeholder="https://airbnb.com/…" maxLength={500} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Notes <span className={styles.optional}>(optional)</span></label>
            <textarea className={styles.textarea} value={propForm.notes} onChange={(e) => setPropForm({ ...propForm, notes: e.target.value })} rows={2} placeholder="Check-in details, parking, anything useful" />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Floorplans & photos</label>
            {editProp === "new" ? (
              <p className={ui.emptyHint}>Save the property first, then add photos.</p>
            ) : (
              <div className={ui.thumbRow}>
                {(editProp?.images || []).map((img) => (
                  <div key={img.id} className={ui.thumb}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.caption || "Floorplan"} />
                    <button type="button" className={ui.thumbDel} aria-label="Remove image" onClick={() => deleteImage((editProp as LodgingProperty).id, img.id)}>×</button>
                  </div>
                ))}
                <button type="button" className={ui.uploadTile} onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? "…" : (
                    <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 5v14M5 12h14" />
                    </svg>
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadImage(f);
                    e.target.value = "";
                  }}
                />
              </div>
            )}
          </div>

          {err && <p className={styles.formError}>{err}</p>}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button type="submit" className={styles.createBtn} disabled={busy || !propForm.name.trim()} style={{ opacity: busy || !propForm.name.trim() ? 0.6 : 1 }}>
              {busy ? "Saving…" : editProp === "new" ? "Add property" : "Save changes"}
            </button>
            {editProp && editProp !== "new" && (
              <button type="button" className={styles.deleteBtn} onClick={() => setConfirmDel({ kind: "property", id: (editProp as LodgingProperty).id, label: (editProp as LodgingProperty).name })}>
                Delete property
              </button>
            )}
          </div>
        </form>
      </Modal>

      {/* ── Room modal ─────────────────────────────────────────────────────────── */}
      <Modal open={editRoom !== null} title={editRoom?.mode === "new" ? "New room" : "Edit room"} onClose={() => setEditRoom(null)}>
        <form className={styles.form} onSubmit={saveRoom}>
          <div className={styles.field}>
            <label className={styles.label}>Name or number</label>
            <input className={styles.input} value={roomForm.label} onChange={(e) => setRoomForm({ ...roomForm, label: e.target.value })} placeholder="e.g. 214, Master Suite" maxLength={80} autoFocus />
          </div>
          <div className={styles.profileTwoCol}>
            <div className={styles.field}>
              <label className={styles.label}>Bed type <span className={styles.optional}>(optional)</span></label>
              <select className={styles.selectInput} value={roomForm.bed_type} onChange={(e) => setRoomForm({ ...roomForm, bed_type: e.target.value })}>
                <option value="">Not specified</option>
                {BED_TYPES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}># of beds <span className={styles.optional}>(optional)</span></label>
              <input className={styles.input} type="number" min={0} value={roomForm.bed_count} onChange={(e) => setRoomForm({ ...roomForm, bed_count: e.target.value })} placeholder="1" />
            </div>
          </div>
          <div className={styles.profileTwoCol}>
            <div className={styles.field}>
              <label className={styles.label}>Floor <span className={styles.optional}>(optional)</span></label>
              <input className={styles.input} value={roomForm.floor} onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })} placeholder="2, Ground" maxLength={40} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Sleeps <span className={styles.optional}>(optional)</span></label>
              <input className={styles.input} type="number" min={0} value={roomForm.capacity} onChange={(e) => setRoomForm({ ...roomForm, capacity: e.target.value })} placeholder="2" />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Features</label>
            <div className={ui.flagRow} role="group" aria-label="Room features">
              {ROOM_FLAGS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={styles.pill}
                  data-on={roomForm[f.key] || undefined}
                  onClick={() => setRoomForm({ ...roomForm, [f.key]: !roomForm[f.key] })}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Notes <span className={styles.optional}>(optional)</span></label>
            <textarea className={styles.textarea} value={roomForm.notes} onChange={(e) => setRoomForm({ ...roomForm, notes: e.target.value })} rows={2} placeholder="Anything worth knowing" />
          </div>

          {err && <p className={styles.formError}>{err}</p>}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button type="submit" className={styles.createBtn} disabled={busy || !roomForm.label.trim()} style={{ opacity: busy || !roomForm.label.trim() ? 0.6 : 1 }}>
              {busy ? "Saving…" : editRoom?.mode === "new" ? "Add room" : "Save changes"}
            </button>
            {editRoom?.mode === "edit" && (
              <button type="button" className={styles.deleteBtn} onClick={() => setConfirmDel({ kind: "room", id: editRoom.room.id, label: editRoom.room.label })}>
                Delete room
              </button>
            )}
          </div>
        </form>
      </Modal>

      {/* ── Assignment drawer ──────────────────────────────────────────────────── */}
      <Modal open={assignRoom !== null} title={assignRoom ? `Who's in ${assignRoom.label}?` : ""} onClose={() => setAssignRoom(null)}>
        {assignRoom && (
          <div>
            {assignRoom.capacity != null && (
              <p className={ui.emptyHint} style={{ marginTop: 0 }}>
                {assignRoomOccupants.length}/{assignRoom.capacity} spots filled
                {assignRoomOccupants.length > assignRoom.capacity && <span className={ui.capWarn}> (over capacity)</span>}
              </p>
            )}
            {members.length === 0 ? (
              <p className={ui.emptyHint}>No one is on the roster for this event yet.</p>
            ) : (
              <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
                {members.map((m) => {
                  const inThis = roomOfUser.get(m.user_id) === assignRoom.id;
                  const elsewhereId = roomOfUser.get(m.user_id);
                  const elsewhere = elsewhereId && elsewhereId !== assignRoom.id ? rooms.find((r) => r.id === elsewhereId) : null;
                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      className={ui.assignRow}
                      onClick={() => (inThis ? unassignMember(m.user_id) : assignMember(assignRoom.id, m.user_id))}
                    >
                      {m.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className={ui.occAvatar} src={m.avatar_url} alt="" />
                      ) : (
                        <span className={ui.avatarFallback}>{initials(m.name)}</span>
                      )}
                      <span className={ui.assignName}>
                        {m.name}
                        {m.allergies && <span className={ui.assignAllergy}>⚠ {m.allergies}</span>}
                      </span>
                      {elsewhere && <span className={ui.assignWhere}>in {elsewhere.label}</span>}
                      <span className={`${ui.assignCheck} ${inThis ? ui.assignCheckOn : ""}`}>
                        {inThis && (
                          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        title={confirmDel?.kind === "clearAll" ? "Clear all assignments?" : confirmDel?.kind === "property" ? "Delete property?" : "Delete room?"}
        message={
          confirmDel?.kind === "clearAll"
            ? "Unassign everyone from every room for this event. Rooms and properties stay."
            : confirmDel?.kind === "property"
              ? `Delete "${confirmDel.label}" and all of its rooms and assignments?`
              : confirmDel
                ? `Delete "${confirmDel.label}" and its assignments?`
                : undefined
        }
        confirmLabel={confirmDel?.kind === "clearAll" ? "Clear all" : "Delete"}
        destructive
        onConfirm={() => {
          const c = confirmDel;
          setConfirmDel(null);
          if (!c) return;
          if (c.kind === "clearAll") clearAll();
          else if (c.kind === "property" && c.id) {
            deleteProp(c.id);
            setEditProp(null);
          } else if (c.kind === "room" && c.id) {
            deleteRoom(c.id);
            setEditRoom(null);
          }
        }}
        onCancel={() => setConfirmDel(null)}
      />
    </>
  );
}
