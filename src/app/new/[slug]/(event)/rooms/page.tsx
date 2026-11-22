import { redirect } from "next/navigation";
import Link from "next/link";
import { v2ServerClient, v2AdminClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { loadResolvedFeatures } from "@/lib/v2/features-server";
import { isFeatureVisible } from "@/lib/v2/features";
import { pickName } from "@/lib/v2/profile";
import {
  PROPERTY_SELECT,
  IMAGE_SELECT,
  ROOM_SELECT,
  ASSIGNMENT_SELECT,
  type LodgingProperty,
  type LodgingRoom,
  type LodgingAssignment,
} from "@/lib/v2/lodging";
import RoomsView, { type PropertyVM } from "./RoomsView";
import styles from "@/app/new/new.module.css";
import ui from "@/app/new/[slug]/admin/events/[eventId]/lodging/lodging.module.css";

interface Occupant { user_id: string; name: string; avatar_url: string | null }

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

/**
 * Member-facing lodging ("Rooms") — read-only. Shows the viewer's own room first,
 * then every property and its rooms with occupants. Gated by the rooms feature toggle.
 */
export default async function RoomsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const supabase = await v2ServerClient();
  const admin = v2AdminClient();
  const isAdmin = org.role === "owner" || org.role === "admin";

  // Resolve against the active event (Rooms is event-scoped), matching Schedule.
  const { data: events } = await admin
    .from("v2_events")
    .select("id, name, status, start_date")
    .eq("org_id", org.id)
    .order("status", { ascending: true })
    .order("start_date", { ascending: false });
  const event = (events || []).find((e) => e.status === "active") || (events || [])[0] || null;

  const resolved = await loadResolvedFeatures(supabase, org.id, event?.id ?? null);
  if (!isFeatureVisible(resolved, "rooms", isAdmin)) redirect(`/new/${slug}`);
  if (!event) redirect(`/new/${slug}`);

  const [{ data: properties }, { data: rooms }, { data: assignments }] = await Promise.all([
    admin
      .from("v2_lodging_properties")
      .select(`${PROPERTY_SELECT}, images:v2_lodging_property_images(${IMAGE_SELECT})`)
      .eq("event_id", event.id)
      .order("created_at"),
    admin.from("v2_lodging_rooms").select(ROOM_SELECT).eq("event_id", event.id).order("created_at"),
    admin.from("v2_lodging_assignments").select(ASSIGNMENT_SELECT).eq("event_id", event.id),
  ]);

  const props = (properties as LodgingProperty[]) || [];
  const allRooms = (rooms as LodgingRoom[]) || [];
  const allAssign = (assignments as LodgingAssignment[]) || [];

  // Names/avatars for everyone who has an assignment.
  const assignedIds = [...new Set(allAssign.map((a) => a.user_id))];
  const { data: profiles } = assignedIds.length
    ? await admin.from("v2_profiles").select("id, display_name, first_name, last_name, avatar_url").in("id", assignedIds)
    : { data: [] as unknown[] };
  const occById = new Map<string, Occupant>(
    ((profiles || []) as Array<{ id: string; display_name: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null }>).map((p) => [
      p.id,
      { user_id: p.id, name: pickName(p, org.name_display), avatar_url: p.avatar_url },
    ]),
  );

  const occupantsByRoom = new Map<string, Occupant[]>();
  for (const a of allAssign) {
    const o = occById.get(a.user_id);
    if (o) (occupantsByRoom.get(a.room_id) || occupantsByRoom.set(a.room_id, []).get(a.room_id)!).push(o);
  }
  for (const list of occupantsByRoom.values()) list.sort((x, y) => x.name.localeCompare(y.name));

  const roomsByProperty = new Map<string, LodgingRoom[]>();
  for (const r of allRooms) (roomsByProperty.get(r.property_id) || roomsByProperty.set(r.property_id, []).get(r.property_id)!).push(r);

  // The viewer's own room.
  const myAssign = allAssign.find((a) => a.user_id === ctx.userId);
  const myRoom = myAssign ? allRooms.find((r) => r.id === myAssign.room_id) || null : null;
  const myProp = myRoom ? props.find((p) => p.id === myRoom.property_id) || null : null;
  const myRoommates = myRoom ? (occupantsByRoom.get(myRoom.id) || []).filter((o) => o.user_id !== ctx.userId) : [];

  const nothingSetUp = allRooms.length === 0;

  // Serializable view-model for the client sort/search component.
  const propertiesVM: PropertyVM[] = props.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    address: p.address,
    listing_url: p.listing_url,
    notes: p.notes,
    images: (p.images || []).map((i) => ({ id: i.id, url: i.url, caption: i.caption })),
    rooms: (roomsByProperty.get(p.id) || []).map((r) => ({ ...r, occupants: occupantsByRoom.get(r.id) || [] })),
  }));

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Home
      </Link>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Rooms</h1>
      </div>

      {nothingSetUp ? (
        <p className={ui.emptyHint}>Room assignments haven&apos;t been set up yet. Check back soon.</p>
      ) : (
        <>
          {/* Your room */}
          <div className={ui.propCard} style={{ borderColor: "var(--accent, #2f7d4f)" }}>
            {myRoom ? (
              <>
                <h2 className={ui.propTitle}>Your room: {myRoom.label}</h2>
                {myProp && <p className={ui.propMeta}>{myProp.name}{myProp.address ? `, ${myProp.address}` : ""}</p>}
                {roomAttrs(myRoom) && <p className={ui.propMeta}>{roomAttrs(myRoom)}</p>}
                {myRoommates.length > 0 ? (
                  <div className={ui.occupants}>
                    {myRoommates.map((m) => (
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
                  </div>
                ) : (
                  <p className={ui.propMeta}>You have this room to yourself.</p>
                )}
              </>
            ) : (
              <>
                <h2 className={ui.propTitle}>Your room</h2>
                <p className={ui.propMeta}>You haven&apos;t been assigned to a room yet.</p>
              </>
            )}
          </div>

          {/* All properties: client-side sort (room number / resident) + resident search */}
          <RoomsView properties={propertiesVM} myUserId={ctx.userId} />
        </>
      )}
    </div>
  );
}
