import type { SupabaseClient } from "@supabase/supabase-js";
import { orgNameMode } from "./orgs";
import { pickName } from "./profile";

/** A member card for the directory grid/tree. */
export interface DirectoryMember {
  id: string;
  displayName: string;
  fullName: string | null;
  avatarUrl: string | null;
  sponsorId: string | null;
  isFounder: boolean;
  city: string | null;
  state: string | null;
  eventsAttended: number;
  archived: boolean;
}

/**
 * Load the full member directory for an org: every active member with name, avatar,
 * sponsor, founder flag, hometown, and events-attended count. Shared by the server
 * page (initial render, no client round-trip) and GET /api/v2/members (live refresh).
 */
export async function loadMembersDirectory(admin: SupabaseClient, orgId: string): Promise<DirectoryMember[]> {
  const [{ data: rows }, mode, { data: events }] = await Promise.all([
    admin
      .from("v2_memberships")
      .select(
        "user_id, archived_at, member:v2_profiles(id, display_name, first_name, last_name, avatar_url, sponsor_id, is_founder, city, state)",
      )
      .eq("org_id", orgId)
      .eq("status", "active"),
    orgNameMode(admin, orgId),
    admin.from("v2_events").select("id").eq("org_id", orgId),
  ]);

  // events-attended per member (distinct events the member is on the roster for).
  const eventIds = (events || []).map((e) => e.id);
  const attended = new Map<string, Set<string>>();
  if (eventIds.length) {
    const { data: parts } = await admin
      .from("v2_event_participants")
      .select("user_id, event_id")
      .in("event_id", eventIds)
      .eq("on_roster", true);
    for (const p of parts || []) {
      if (!attended.has(p.user_id)) attended.set(p.user_id, new Set());
      attended.get(p.user_id)!.add(p.event_id);
    }
  }

  return (rows || [])
    .map((r) => {
      const p = Array.isArray(r.member) ? r.member[0] : r.member;
      if (!p) return null;
      const full = `${(p.first_name || "").trim()} ${(p.last_name || "").trim()}`.trim();
      return {
        id: p.id as string,
        displayName: pickName(p, mode),
        fullName: full || null,
        avatarUrl: (p.avatar_url as string | null) ?? null,
        sponsorId: (p.sponsor_id as string | null) ?? null,
        isFounder: p.is_founder === true,
        city: (p.city as string | null) ?? null,
        state: (p.state as string | null) ?? null,
        eventsAttended: attended.get(p.id as string)?.size ?? 0,
        archived: !!(r.archived_at as string | null),
      } as DirectoryMember;
    })
    .filter((m): m is DirectoryMember => m !== null)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
