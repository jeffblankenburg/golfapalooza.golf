"use client";

import { useRouter } from "next/navigation";
import SquaresEditor, { type SquaresContestRow } from "../SquaresEditor";

/**
 * Opens the shared Squares editor for an existing pool, then returns to the manage
 * page on close/save. Used by the event manage page's `?edit` route so event
 * Squares get the same full editor (including games) as the group hub — "edit any
 * aspect, any time". Edits go to the scope-agnostic per-contest routes.
 */
export default function SquaresEditLauncher({
  row,
  collectionBase,
  returnHref,
}: {
  row: SquaresContestRow;
  collectionBase: string;
  returnHref: string;
}) {
  const router = useRouter();
  return (
    <SquaresEditor
      collectionBase={collectionBase}
      editing={row}
      onClose={() => router.push(returnHref)}
      onSaved={() => router.refresh()}
    />
  );
}
