import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Managed auto-membership chat channels (#192 follow-up, v1 parity).
 *
 *   all_members — one per org; always holds every active, non-archived member.
 *   event       — one per event; holds everyone opted into the event (on_roster).
 *
 * These helpers keep v2_chat_room_members in sync from the app layer (wired into
 * org-join, member archive/restore, RSVP, and event creation). Every caller
 * treats them as best-effort: a sync failure must never block the primary action.
 * All writes go through the service-role client.
 */

/** Find-or-create the org's all-members channel; returns its id. */
export async function ensureAllMembersRoom(admin: SupabaseClient, orgId: string): Promise<string> {
  const { data: existing } = await admin
    .from("v2_chat_rooms")
    .select("id")
    .eq("org_id", orgId)
    .eq("room_kind", "all_members")
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: org } = await admin
    .from("v2_organizations")
    .select("member_noun_plural")
    .eq("id", orgId)
    .maybeSingle();
  const noun = (org?.member_noun_plural as string | null)?.trim() || "Members";

  const { data: room, error } = await admin
    .from("v2_chat_rooms")
    .insert({ org_id: orgId, type: "group", name: `All ${noun}`, room_kind: "all_members" })
    .select("id")
    .single();
  if (error) throw error;
  return room.id as string;
}

/** Add an active member to the all-members channel (idempotent). */
export async function addToAllMembers(admin: SupabaseClient, orgId: string, userId: string): Promise<void> {
  const roomId = await ensureAllMembersRoom(admin, orgId);
  await admin
    .from("v2_chat_room_members")
    .upsert({ room_id: roomId, user_id: userId, role: "member" }, { onConflict: "room_id,user_id", ignoreDuplicates: true });
}

/**
 * Remove a user from every managed channel in an org (all_members + all event
 * channels). Used when a member is archived or removed. Their messages stay.
 */
export async function removeFromManagedChannels(admin: SupabaseClient, orgId: string, userId: string): Promise<void> {
  const { data: rooms } = await admin
    .from("v2_chat_rooms")
    .select("id")
    .eq("org_id", orgId)
    .in("room_kind", ["all_members", "event"]);
  const ids = (rooms || []).map((r) => r.id as string);
  if (ids.length === 0) return;
  await admin.from("v2_chat_room_members").delete().in("room_id", ids).eq("user_id", userId);
}

/** Find-or-create an event's channel; returns its id. */
export async function ensureEventRoom(
  admin: SupabaseClient,
  orgId: string,
  eventId: string,
  name: string,
): Promise<string> {
  const { data: existing } = await admin
    .from("v2_chat_rooms")
    .select("id")
    .eq("event_id", eventId)
    .eq("room_kind", "event")
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: room, error } = await admin
    .from("v2_chat_rooms")
    .insert({ org_id: orgId, event_id: eventId, type: "group", name, room_kind: "event" })
    .select("id")
    .single();
  if (error) throw error;
  return room.id as string;
}

/**
 * Sync one member's event-channel membership to their opt-in state. `optedIn`
 * (on_roster / likelihood===99) adds them with full history; opting out removes
 * the membership so the room leaves their list — messages persist. No-op if the
 * event has no channel (e.g. an event that predates the feature).
 */
export async function syncEventChannelMembership(
  admin: SupabaseClient,
  eventId: string,
  userId: string,
  optedIn: boolean,
): Promise<void> {
  const { data: room } = await admin
    .from("v2_chat_rooms")
    .select("id")
    .eq("event_id", eventId)
    .eq("room_kind", "event")
    .maybeSingle();
  if (!room) return;

  if (optedIn) {
    await admin
      .from("v2_chat_room_members")
      .upsert({ room_id: room.id, user_id: userId, role: "member" }, { onConflict: "room_id,user_id", ignoreDuplicates: true });
  } else {
    await admin.from("v2_chat_room_members").delete().eq("room_id", room.id).eq("user_id", userId);
  }
}
