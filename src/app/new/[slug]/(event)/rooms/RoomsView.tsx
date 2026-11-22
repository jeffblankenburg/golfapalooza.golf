"use client";

import { useMemo, useState } from "react";
import { type LodgingRoom } from "@/lib/v2/lodging";
import { PROPERTY_KINDS } from "@/lib/v2/lodging";
import styles from "@/app/new/new.module.css";
import ui from "@/app/new/[slug]/admin/events/[eventId]/lodging/lodging.module.css";

export interface ViewOccupant { user_id: string; name: string; avatar_url: string | null }
export interface RoomVM extends LodgingRoom { occupants: ViewOccupant[] }
export interface PropertyVM {
  id: string;
  name: string;
  kind: string | null;
  address: string | null;
  listing_url: string | null;
  notes: string | null;
  images: { id: string; url: string; caption: string | null }[];
  rooms: RoomVM[];
}

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
const byNumber = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

function Avatar({ o }: { o: ViewOccupant }) {
  return o.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={ui.occAvatar} src={o.avatar_url} alt="" />
  ) : (
    <span className={ui.avatarFallback}>{initials(o.name)}</span>
  );
}

export default function RoomsView({ properties, myUserId }: { properties: PropertyVM[]; myUserId: string }) {
  const [mode, setMode] = useState<"room" | "resident">("room");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Flat resident index for resident mode + search.
  const residents = useMemo(() => {
    const out: { occ: ViewOccupant; roomLabel: string; propertyName: string }[] = [];
    for (const p of properties) for (const r of p.rooms) for (const o of r.occupants) {
      out.push({ occ: o, roomLabel: r.label, propertyName: p.name });
    }
    return out.sort((a, b) => byNumber(a.occ.name, b.occ.name));
  }, [properties]);

  const matchedResidents = q ? residents.filter((r) => r.occ.name.toLowerCase().includes(q)) : residents;

  // Room mode: sort rooms by number, and when searching, keep only rooms with a
  // matching resident (that's what someone searching a name wants to land on).
  const roomProperties = useMemo(() => {
    return properties
      .map((p) => {
        let rooms = [...p.rooms].sort((a, b) => byNumber(a.label, b.label));
        if (q) rooms = rooms.filter((r) => r.occupants.some((o) => o.name.toLowerCase().includes(q)));
        return { ...p, rooms };
      })
      .filter((p) => !q || p.rooms.length > 0);
  }, [properties, q]);

  return (
    <>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          className={styles.input}
          type="search"
          placeholder="Search for a resident…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search for a resident"
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label htmlFor="roomsSort" className={styles.label} style={{ margin: 0, flex: "none" }}>Sort</label>
          <select
            id="roomsSort"
            className={styles.selectInput}
            style={{ width: "auto", flex: "1 1 auto" }}
            value={mode}
            onChange={(e) => setMode(e.target.value as "room" | "resident")}
          >
            <option value="room">Room number</option>
            <option value="resident">Resident</option>
          </select>
        </div>
      </div>

      {mode === "resident" || q ? (
        /* Resident list (also the search result surface). */
        <div className={ui.propCard}>
          {matchedResidents.length === 0 ? (
            <p className={ui.emptyHint} style={{ marginTop: 0 }}>{q ? "No one by that name." : "No one is assigned to a room yet."}</p>
          ) : (
            matchedResidents.map(({ occ, roomLabel, propertyName }) => (
              <div key={occ.user_id} className={ui.residentRow}>
                <Avatar o={occ} />
                <span className={ui.residentName}>
                  {occ.name}
                  {occ.user_id === myUserId && <span className={ui.youTag}>YOU</span>}
                </span>
                <span className={ui.residentWhere}>{roomLabel}, {propertyName}</span>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Grouped by property, rooms by number. */
        roomProperties.map((p) => {
          const kindLabel = PROPERTY_KINDS.find((k) => k.key === p.kind)?.label;
          return (
            <div key={p.id} className={ui.propCard}>
              <h2 className={ui.propTitle}>
                {p.name}
                {kindLabel && <span className={ui.propKind}>{kindLabel}</span>}
              </h2>
              {p.address && <p className={ui.propMeta}>{p.address}</p>}
              {p.listing_url && (
                <p className={ui.propMeta}>
                  <a className={ui.propLink} href={p.listing_url} target="_blank" rel="noopener noreferrer">View listing</a>
                </p>
              )}
              {p.notes && <p className={ui.propMeta}>{p.notes}</p>}

              {p.images.length > 0 && (
                <div className={ui.thumbRow}>
                  {p.images.map((img) => (
                    <a key={img.id} className={ui.thumb} href={img.url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={img.caption || "Floorplan"} />
                      {img.caption && <span className={ui.thumbCap}>{img.caption}</span>}
                    </a>
                  ))}
                </div>
              )}

              <div className={ui.roomList}>
                {p.rooms.length === 0 ? (
                  <p className={ui.emptyHint}>No rooms listed.</p>
                ) : (
                  p.rooms.map((r) => {
                    const attrs = roomAttrs(r);
                    return (
                      <div key={r.id} className={ui.roomRow}>
                        <div className={ui.roomMain} style={{ cursor: "default" }}>
                          <span className={ui.roomLabel}>{r.label}</span>
                          {attrs && <span className={ui.roomAttrs} style={{ display: "block" }}>{attrs}</span>}
                          {r.occupants.length > 0 ? (
                            <span className={ui.occupants}>
                              {r.occupants.map((m) => (
                                <span key={m.user_id} className={ui.occ}>
                                  <Avatar o={m} />
                                  {m.name}
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span className={ui.roomAttrs} style={{ display: "block" }}>Open</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
