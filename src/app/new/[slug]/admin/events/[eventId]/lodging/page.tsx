import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
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
import LodgingManager, { type RosterMember } from "./LodgingManager";
import styles from "@/app/new/new.module.css";

/**
 * Admin lodging ("Rooms") setup for an event. Owner/admin only. Admins define
 * properties (hotel / rental), their rooms, floorplans/photos, and assign the
 * roster to rooms. Opt-in feature, so a group with no lodging simply leaves it off.
 */
export default async function EventLodgingPage({ params }: { params: Promise<{ slug: string; eventId: string }> }) {
  const { slug, eventId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const admin = v2AdminClient();
  const { data: event } = await admin
    .from("v2_events")
    .select("id, name")
    .eq("id", eventId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!event) redirect(`/new/${slug}/admin`);

  const [{ data: properties }, { data: rooms }, { data: assignments }, { data: rosterRows }] = await Promise.all([
    admin
      .from("v2_lodging_properties")
      .select(`${PROPERTY_SELECT}, images:v2_lodging_property_images(${IMAGE_SELECT})`)
      .eq("event_id", eventId)
      .order("created_at"),
    admin.from("v2_lodging_rooms").select(ROOM_SELECT).eq("event_id", eventId).order("created_at"),
    admin.from("v2_lodging_assignments").select(ASSIGNMENT_SELECT).eq("event_id", eventId),
    admin.from("v2_event_participants").select("user_id").eq("event_id", eventId).eq("on_roster", true),
  ]);

  const rosterIds = (rosterRows || []).map((r) => r.user_id as string);
  const { data: profiles } = rosterIds.length
    ? await admin.from("v2_profiles").select("id, display_name, first_name, last_name, avatar_url, allergies").in("id", rosterIds)
    : { data: [] as unknown[] };

  const members: RosterMember[] = ((profiles || []) as Array<{ id: string; display_name: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null; allergies: string | null }>)
    .map((p) => ({ user_id: p.id, name: pickName(p, org.name_display), avatar_url: p.avatar_url, allergies: p.allergies }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className={styles.page}>
      <LodgingManager
        slug={slug}
        orgId={org.id}
        eventId={eventId}
        eventName={event.name}
        initialProperties={(properties as LodgingProperty[]) || []}
        initialRooms={(rooms as LodgingRoom[]) || []}
        initialAssignments={(assignments as LodgingAssignment[]) || []}
        members={members}
      />
    </div>
  );
}
