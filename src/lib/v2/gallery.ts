import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export const GALLERY_BUCKET = "v2-gallery-media";

/**
 * Resolve access to a single gallery item: authenticate, load the item, and
 * confirm the caller is a member of the item's org. Returns an admin client.
 */
export interface GalleryItemAccess {
  admin: SupabaseClient;
  userId: string;
  item: { id: string; org_id: string; uploader_id: string; media_url: string; thumbnail_url: string | null };
}

export async function resolveGalleryItem(
  request: Request,
  itemId: string,
): Promise<GalleryItemAccess | { error: string; status: 401 | 403 | 404 }> {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: "Not authenticated", status: 401 };

  const admin = v2AdminClient();
  const { data: item } = await admin
    .from("v2_gallery_items")
    .select("id, org_id, uploader_id, media_url, thumbnail_url")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { error: "Item not found", status: 404 };

  const { data: membership } = await admin
    .from("v2_memberships")
    .select("id")
    .eq("org_id", item.org_id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return { error: "Not a member", status: 403 };

  return { admin, userId, item };
}
