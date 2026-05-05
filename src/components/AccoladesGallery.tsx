// Icon-only grid for /accolades and /spectator/accolades. Tap a badge to drill
// into that award's history page (`{hrefBase}/{category}`).

import Link from "next/link";
import { AwardBadge } from "@/components/AwardBadge";

interface UserRef {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface AccoladeRow {
  id: string;
  trip_year: number | null;
  custom_title: string | null;
  notes: string | null;
  winner: UserRef | null;
  partner: UserRef | null;
}

export interface AccoladeCategorySection {
  category: string;
  title: string;
  short_label: string;
  icon: string;
  icon_url: string | null;
  description: string | null;
  rows: AccoladeRow[];
}

export function AccoladesGallery({
  sections,
  hrefBase = "/accolades",
}: {
  sections: AccoladeCategorySection[];
  hrefBase?: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {sections.map((s) => (
        <Link
          key={s.category}
          href={`${hrefBase}/${s.category}`}
          title={s.title}
          aria-label={s.title}
          className="aspect-square flex items-center justify-center p-1 active:scale-95 transition-transform"
        >
          <AwardBadge iconUrl={s.icon_url} emoji={s.icon} alt={s.title} fill />
        </Link>
      ))}
    </div>
  );
}
