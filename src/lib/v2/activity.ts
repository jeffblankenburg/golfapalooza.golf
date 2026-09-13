import type { SupabaseClient } from "@supabase/supabase-js";

/** Unified activity-feed model for v2. Forward-only: features append as events happen. */

export type ActivityKind = "round" | "photo" | "song" | "article" | "announcement" | "rsvp";

export interface ActivityRow {
  id: string;
  kind: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link: string | null;
  created_at: string;
  ref_id: string | null;
  metadata: Record<string, unknown> | null;
  actor: {
    display_name: string;
    first_name?: string | null;
    last_name?: string | null;
    avatar_url: string | null;
  } | null;
}

export interface LogActivityInput {
  orgId: string;
  eventId?: string | null;
  kind: ActivityKind | string;
  actorId?: string | null;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  link?: string | null;
  refId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append an event to the activity feed. Call from the feature that generated it
 * (server-side, with a service-role client). Best-effort — callers should not let
 * a feed-log failure break the primary action.
 */
export async function logActivity(
  admin: SupabaseClient,
  input: LogActivityInput,
): Promise<void> {
  await admin.from("v2_activity").insert({
    org_id: input.orgId,
    event_id: input.eventId ?? null,
    kind: input.kind,
    actor_id: input.actorId ?? null,
    title: input.title,
    subtitle: input.subtitle ?? null,
    image_url: input.imageUrl ?? null,
    link: input.link ?? null,
    ref_id: input.refId ?? null,
    metadata: input.metadata ?? {},
  });
}

/** Compact relative time, e.g. "just now", "3h ago", "2d ago", "Aug 14". */
export function timeAgo(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
