"use client";

import { useRouter } from "next/navigation";
import BoxesEditor, { type BoxesContestRow } from "../BoxesEditor";

/**
 * Opens the shared Boxes editor for an existing pool, then returns to the manage
 * page on close/save. Used by the event manage page's `?edit` route so event
 * Boxes get the same full editor (including games) as the group hub — "edit any
 * aspect, any time". Edits go to the scope-agnostic per-contest routes.
 */
export default function BoxesEditLauncher({
  row,
  collectionBase,
  returnHref,
}: {
  row: BoxesContestRow;
  collectionBase: string;
  returnHref: string;
}) {
  const router = useRouter();
  return (
    <BoxesEditor
      collectionBase={collectionBase}
      editing={row}
      onClose={() => router.push(returnHref)}
      onSaved={() => router.refresh()}
    />
  );
}
