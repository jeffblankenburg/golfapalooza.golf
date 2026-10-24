"use client";

import { useState } from "react";
import SquaresEditor, { type SquaresContestRow } from "../SquaresEditor";
import { type NameMode } from "@/lib/v2/profile";
import styles from "@/app/new/new.module.css";

/**
 * "Add games" trigger for the Squares detail page — opens the shared editor as a
 * MODAL in games-only mode to add games to the slate. Per-game payout tuning and
 * deletion happen from each game's own gear in the manage view.
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
        + Add games
      </button>
      {open && (
        <SquaresEditor
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
