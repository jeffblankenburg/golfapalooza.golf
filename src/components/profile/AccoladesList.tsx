"use client";

import Link from "next/link";
import { AwardBadge } from "@/components/AwardBadge";

interface AccoladeUserRef {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface AccoladeCategoryMeta {
  category: string;
  title: string;
  short_label: string;
  icon: string;
  icon_url: string | null;
  description: string | null;
  sort_order: number;
}

export interface AccoladeData {
  id: string;
  title: string;
  category: string;
  user_id: string;
  partner_user_id: string | null;
  trip: { trip_year: number }[] | { trip_year: number } | null;
  winner: AccoladeUserRef[] | AccoladeUserRef | null;
  partner: AccoladeUserRef[] | AccoladeUserRef | null;
  category_meta: AccoladeCategoryMeta[] | AccoladeCategoryMeta | null;
}

function unwrap<T>(v: T[] | T | null | undefined): T | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

export function AccoladesList({
  accolades,
  accoladeHrefBase = "/accolades",
}: {
  accolades: AccoladeData[];
  /** Optional — kept for source compatibility with callers that still pass it. */
  profileUserId?: string;
  /** Where each cell links. Use "/spectator/accolades" on public pages. */
  accoladeHrefBase?: string;
  /** Optional — kept for source compatibility. Partner info now lives on the award detail page. */
  loozerHrefBase?: string;
}) {
  // Newest year first. Undated rows fall to the bottom.
  const sorted = [...accolades].sort((a, b) => {
    const ay = unwrap(a.trip)?.trip_year ?? -Infinity;
    const by = unwrap(b.trip)?.trip_year ?? -Infinity;
    return by - ay;
  });

  return (
    <div className="grid grid-cols-5 gap-2">
      {sorted.map((a) => (
        <AccoladeCell key={a.id} accolade={a} accoladeHrefBase={accoladeHrefBase} />
      ))}
    </div>
  );
}

function AccoladeCell({
  accolade,
  accoladeHrefBase,
}: {
  accolade: AccoladeData;
  accoladeHrefBase: string;
}) {
  const meta = unwrap(accolade.category_meta);
  const trip = unwrap(accolade.trip);
  const displayTitle =
    accolade.category === "custom" || !meta ? accolade.title : meta.title;
  const subtitle = trip?.trip_year ? String(trip.trip_year) : "—";

  return (
    <Link
      href={`${accoladeHrefBase}/${accolade.category}`}
      title={displayTitle}
      className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
    >
      <div className="aspect-square w-full flex items-center justify-center">
        <AwardBadge
          iconUrl={meta?.icon_url}
          emoji={meta?.icon}
          alt={displayTitle}
          fill
        />
      </div>
      <span className="text-xs font-mono text-gray-500 leading-none">{subtitle}</span>
    </Link>
  );
}
