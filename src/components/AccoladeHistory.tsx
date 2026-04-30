// Single-award history view used by /accolades/[category] and the spectator
// equivalent. Header shows the badge + title + description; below is the
// reverse-chronological roster of winners.

import { Fragment } from "react";
import Link from "next/link";
import { AwardBadge } from "@/components/AwardBadge";
import type { AccoladeCategorySection, AccoladeRow } from "@/components/AccoladesGallery";

export function AccoladeHistory({
  section,
  loozerHrefBase,
  backHref,
}: {
  section: AccoladeCategorySection;
  loozerHrefBase: string;
  backHref: string;
}) {
  // Reverse-chronological. Undated rows fall to the bottom.
  const rows = [...section.rows].sort((a, b) => {
    const ay = a.trip_year ?? -Infinity;
    const by = b.trip_year ?? -Infinity;
    return by - ay;
  });

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <Link
        href={backHref}
        className="inline-block px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 active:bg-gray-200 transition-colors"
      >
        &larr; All awards
      </Link>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
        <AwardBadge
          iconUrl={section.icon_url}
          emoji={section.icon}
          alt={section.title}
          size="2xl"
        />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900">{section.title}</h1>
          {section.description && (
            <p className="text-sm text-gray-500 mt-1">{section.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            {section.rows.length} winner{section.rows.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-8">No winners yet.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {rows.map((r) => (
            <Row
              key={r.id}
              row={r}
              loozerHrefBase={loozerHrefBase}
              customLabel={section.category === "custom"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  row,
  customLabel,
  loozerHrefBase,
}: {
  row: AccoladeRow;
  customLabel: boolean;
  loozerHrefBase: string;
}) {
  const teammates = [row.winner, row.partner].filter(
    (u): u is NonNullable<typeof u> => !!u,
  );
  return (
    <div className="px-3 py-2 flex items-center gap-2 text-sm">
      <span className="text-xs font-mono text-gray-400 w-10 shrink-0">
        {row.trip_year ?? "—"}
      </span>
      <div className="flex-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {teammates.length === 0 ? (
          <span className="text-gray-400 italic">unmatched</span>
        ) : (
          teammates.map((u, i) => (
            <Fragment key={u.id}>
              {i > 0 && <span className="text-gray-400">&</span>}
              <Link
                href={`${loozerHrefBase}/${u.id}`}
                className="inline-flex items-center gap-1.5 text-green-700 hover:underline font-medium"
              >
                {u.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.avatar_url}
                    alt=""
                    className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-[10px] font-bold flex-shrink-0">
                    {(u.display_name[0] ?? "?").toUpperCase()}
                  </span>
                )}
                <span>{u.display_name}</span>
              </Link>
            </Fragment>
          ))
        )}
        {customLabel && row.custom_title && (
          <span className="text-gray-500 text-xs">— {row.custom_title}</span>
        )}
      </div>
    </div>
  );
}
