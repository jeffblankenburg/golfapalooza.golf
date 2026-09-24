"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "@/app/new/new.module.css";
import RoundScorecard, { type SCHole, type SCPlayer } from "../../../(event)/RoundScorecard";

interface WatchData {
  id: string;
  status: "in_progress" | "completed" | "abandoned";
  roundType: "18" | "9-front" | "9-back";
  isScramble: boolean;
  orgName: string | null;
  courseName: string;
  dateText: string;
  holes: SCHole[];
  players: SCPlayer[];
  teamNames: string[];
}

/**
 * Public watch view: header (group, course, date, LIVE badge) + the shared
 * read-only scorecard. Polls the public API every 12s while the round is in
 * progress so spectators see scores land; stops once it's complete.
 */
export default function RoundWatch({ roundId }: { roundId: string }) {
  const [data, setData] = useState<WatchData | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/rounds/${roundId}/public`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoaded(true);
    }
  }, [roundId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (data?.status !== "in_progress") return;
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [data?.status, load]);

  if (!loaded) return <div className={styles.watchWrap}><p className={styles.drawerStub}>Loading…</p></div>;
  if (!data) return <div className={styles.watchWrap}><p className={styles.drawerStub}>This round isn&apos;t available.</p></div>;

  return (
    <div className={styles.watchWrap}>
      <div className={styles.watchHeader}>
        {data.orgName && <p className={styles.watchOrg}>{data.orgName}</p>}
        <h1 className={styles.watchCourse}>{data.courseName}</h1>
        <p className={styles.watchSub}>
          {data.dateText}
          {data.status === "in_progress" && <span className={styles.watchLive}>LIVE</span>}
        </p>
      </div>
      <RoundScorecard
        holes={data.holes}
        players={data.players}
        roundType={data.roundType}
        isScramble={data.isScramble}
        teamNames={data.teamNames}
      />
    </div>
  );
}
