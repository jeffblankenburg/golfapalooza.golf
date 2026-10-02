/**
 * Platform-managed cost-item categories (#216 follow-up). System admins edit these
 * in the platform console; groups use them as the pick list for manual cost items.
 * Each carries an emoji icon that renders inline (even in a native <select>).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const COST_CATEGORY_SELECT = "id, key, label, icon, sort_order, is_active, created_at, updated_at";

export interface CostCategory {
  id: string;
  key: string;
  label: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Ordered categories. Active-only by default (the member/admin pick list). */
export async function loadCostCategories(
  admin: SupabaseClient,
  opts: { includeInactive?: boolean } = {},
): Promise<CostCategory[]> {
  let q = admin.from("v2_cost_categories").select(COST_CATEGORY_SELECT).order("sort_order").order("label");
  if (!opts.includeInactive) q = q.eq("is_active", true);
  const { data } = await q;
  return (data || []) as CostCategory[];
}
