"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "@/app/new/new.module.css";
import RoundScorecard, { type SCHole, type SCPlayer } from "../../../(event)/RoundScorecard";

interface Group {
  id: string;
  players: string[];
  thru: number;
}
interface CardData {
  roundType: "18" | "9-front" | "9-back";
  isScramble: boolean;
  holes: SCHole[];
  players: SCPlayer[];
  teamNames: string[];
}

/**
 * Other groups playing this course right now. Renders an accordion per concurrent
 * in-progress round (below the comments block on the live scorer); expanding one
 * loads and shows that group's live scorecard. Polls the group list every 30s and
 * the open card every 15s so it keeps up while everyone plays.
 */
export default function OtherGroups({ roundId }: { roundId: string }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<string, CardData>>({});

  const loadGroups = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/rounds/live?roundId=${roundId}`);
      const d = res.ok ? await res.json() : { groups: [] };
      setGroups(d.groups || []);
    } catch {
      /* ignore */
    }
  }, [roundId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; setState runs after await
    loadGroups();
    const t = setInterval(loadGroups, 30000);
    return () => clearInterval(t);
  }, [loadGroups]);

  const loadCard = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/v2/rounds/${id}/public`);
      if (res.ok) {
        const d = (await res.json()) as CardData;
        setCards((c) => ({ ...c, [id]: d }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!openId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; setState runs after await
    loadCard(openId);
    const t = setInterval(() => loadCard(openId), 15000);
    return () => clearInterval(t);
  }, [openId, loadCard]);

  if (groups.length === 0) return null;

  return (
    <div className={styles.otherGroups}>
      <p className={styles.otherGroupsLabel}>Other groups on this course</p>
      {groups.map((g) => {
        const open = openId === g.id;
        const card = cards[g.id];
        return (
          <div key={g.id} className={styles.groupAccordion}>
            <button
              type="button"
              className={styles.groupHead}
              data-open={open || undefined}
              onClick={() => setOpenId(open ? null : g.id)}
              aria-expanded={open}
            >
              <span className={styles.groupNames}>{g.players.join(", ") || "Group"}</span>
              <span className={styles.groupThru}>{g.thru > 0 ? `thru ${g.thru}` : "not started"}</span>
              <svg className={styles.groupChevron} data-open={open || undefined} width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {open && (
              <div className={styles.groupBody}>
                {card ? (
                  <RoundScorecard
                    holes={card.holes}
                    players={card.players}
                    roundType={card.roundType}
                    isScramble={card.isScramble}
                    teamNames={card.teamNames}
                  />
                ) : (
                  <p className={styles.groupLoading}>Loading…</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
