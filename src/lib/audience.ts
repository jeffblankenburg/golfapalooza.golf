import type { SupabaseClient } from "@supabase/supabase-js";

export type AudienceType = "everyone" | "event" | "custom";

export interface AudienceSpec {
  audience_type: AudienceType;
  audience_user_ids?: string[] | null;
  trip_id?: string | null;
}

export async function resolveAudienceUserIds(
  client: SupabaseClient,
  spec: AudienceSpec
): Promise<string[]> {
  if (spec.audience_type === "everyone") {
    const { data } = await client
      .from("users")
      .select("id")
      .eq("is_active", true);
    return (data || []).map((u: { id: string }) => u.id);
  }

  if (spec.audience_type === "event" && spec.trip_id) {
    const { data } = await client
      .from("event_participants")
      .select("user_id")
      .eq("trip_id", spec.trip_id);
    return (data || []).map((p: { user_id: string }) => p.user_id);
  }

  if (spec.audience_type === "custom") {
    return (spec.audience_user_ids || []) as string[];
  }

  return [];
}

export async function isUserInAudience(
  client: SupabaseClient,
  userId: string,
  spec: AudienceSpec
): Promise<boolean> {
  if (spec.audience_type === "everyone") {
    const { data } = await client
      .from("users")
      .select("id")
      .eq("id", userId)
      .eq("is_active", true)
      .maybeSingle();
    return !!data;
  }

  if (spec.audience_type === "event" && spec.trip_id) {
    const { data } = await client
      .from("event_participants")
      .select("user_id")
      .eq("trip_id", spec.trip_id)
      .eq("user_id", userId)
      .maybeSingle();
    return !!data;
  }

  if (spec.audience_type === "custom") {
    return (spec.audience_user_ids || []).includes(userId);
  }

  return false;
}
