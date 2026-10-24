"use client";

import { useState } from "react";
import SquaresEditor, { type SquaresContestRow } from "../SquaresEditor";
import { type NameMode } from "@/lib/v2/profile";
import styles from "@/app/new/new.module.css";

/**
 * "Edit games & payouts" trigger for the Squares detail page — opens the shared
 * editor as a MODAL in games-only mode (basics/draft live in the gear). Keeps the
 * detail page to a single on-page list (the manage/results view).
 */
export default function SquaresGamesButton({
  row,
  collectionBase,
  nameMode,
  currentUserId,
}: {
  row: SquaresContestRow;
  collectionBase: string;
  nameMode: NameMode;
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={styles.createBtnGhost} onClick={() => setOpen(true)}>
        Edit games &amp; payouts
      </button>
      {open && (
        <SquaresEditor
          variant="modal"
          gamesOnly
          editing={row}
          collectionBase={collectionBase}
          nameMode={nameMode}
          currentUserId={currentUserId}
          onClose={() => setOpen(false)}
          onSaved={() => setOpen(false)}
        />
      )}
    </>
  );
}
