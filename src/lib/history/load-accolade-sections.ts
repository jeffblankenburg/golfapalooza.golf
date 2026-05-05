// Server-only loader that builds the AccoladeCategorySection[] structure used
// by both the authenticated `/accolades` page and the public
// `/spectator/accolades` page. Centralized so both surfaces stay in sync.

import { createAdminClient } from "@/lib/supabase/admin";
import type { AccoladeCategorySection } from "@/components/AccoladesGallery";

export async function loadAccoladeSections(): Promise<AccoladeCategorySection[]> {
  const adminClient = createAdminClient();

  const [{ data: categories }, { data: rows }] = await Promise.all([
    adminClient
      .from("accolade_categories")
      .select("category, title, short_label, icon, icon_url, description, sort_order")
      .order("sort_order"),
    adminClient
      .from("accolades")
      .select(
        "id, category, title, notes, user_id, partner_user_id, trip:trip_settings(trip_year), winner:users!accolades_user_id_fkey(id, display_name, full_name, avatar_url), partner:users!accolades_partner_user_id_fkey(id, display_name, full_name, avatar_url)",
      ),
  ]);

  const categoryList = categories ?? [];
  const allRows = rows ?? [];

  const unwrap = <T>(v: T[] | T | null | undefined): T | null => {
    if (v == null) return null;
    if (Array.isArray(v)) return v[0] ?? null;
    return v;
  };

  const sections: AccoladeCategorySection[] = categoryList.map((c) => ({
    category: c.category,
    title: c.title,
    short_label: c.short_label,
    icon: c.icon,
    icon_url: c.icon_url,
    description: c.description,
    rows: [],
  }));
  const byCategory = new Map(sections.map((s) => [s.category, s] as const));

  for (const r of allRows) {
    const target = byCategory.get(r.category);
    if (!target) continue;
    const trip = unwrap(r.trip);
    const winner = unwrap(r.winner);
    const partner = unwrap(r.partner);
    target.rows.push({
      id: r.id,
      trip_year: trip?.trip_year ?? null,
      custom_title: r.category === "custom" ? r.title : null,
      notes: (r as { notes?: string | null }).notes ?? null,
      winner,
      partner,
    });
  }

  // Reverse-chronological within each category, NULL years to the bottom.
  for (const s of sections) {
    s.rows.sort((a, b) => {
      const ay = a.trip_year ?? -Infinity;
      const by = b.trip_year ?? -Infinity;
      return by - ay;
    });
  }

  return sections;
}

export async function loadAccoladeSection(
  category: string,
): Promise<AccoladeCategorySection | null> {
  const sections = await loadAccoladeSections();
  return sections.find((s) => s.category === category) ?? null;
}
