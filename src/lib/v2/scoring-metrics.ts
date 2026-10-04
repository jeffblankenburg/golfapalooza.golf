/**
 * Platform-managed scoring-metric catalog (#220). System admins curate these in the
 * platform console; group admins pick which metrics a consuming contest (BSPITW /
 * 100 Feet / CTP) collects, and the scramble scorer surfaces the chosen ones.
 * Each carries a description so group admins understand what it measures.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const SCORING_METRIC_SELECT = "id, key, label, description, value_type, sort_order, is_active, created_at, updated_at";

export type MetricValueType = "flag" | "distance" | "count";

export interface ScoringMetric {
  id: string;
  key: string;
  label: string;
  description: string | null;
  value_type: MetricValueType;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Ordered metrics. Active-only by default (the contest/scorer pick list). */
export async function loadScoringMetrics(
  admin: SupabaseClient,
  opts: { includeInactive?: boolean } = {},
): Promise<ScoringMetric[]> {
  let q = admin.from("v2_scoring_metrics").select(SCORING_METRIC_SELECT).order("sort_order").order("label");
  if (!opts.includeInactive) q = q.eq("is_active", true);
  const { data } = await q;
  return (data || []) as ScoringMetric[];
}
