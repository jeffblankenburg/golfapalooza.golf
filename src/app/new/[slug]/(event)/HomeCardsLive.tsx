"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { subscribeToPickem } from "@/lib/v2/realtime/pickem-channel";
import { subscribeToAuction } from "@/lib/v2/realtime/auction-channel";
import { subscribeToProps } from "@/lib/v2/realtime/props-channel";

/**
 * Invisible home-page helper that keeps server-rendered contest cards live. It opens each
 * listed contest's realtime channel and calls `router.refresh()` on any change, which
 * re-renders the whole home route — so the card's badge, pot, moneybag, standings, and even
 * its appearance/disappearance update in place without a manual reload. One instance per
 * card group (Pick'em, Auction); each contest type reuses its own channel. Renders nothing.
 *
 * (Squares cards aren't here: Squares has no realtime publication/channel yet, so there's
 * nothing to subscribe to — a prerequisite, not an oversight.)
 */
export type LiveContest =
  | { type: "pickem"; contestId: string }
  | { type: "auction"; contestId: string; tournamentId: string | null }
  | { type: "props"; contestId: string };

export default function HomeCardsLive({ contests }: { contests: LiveContest[] }) {
  const router = useRouter();
  // Stable signature so we only re-subscribe when the actual contest set changes, not on
  // every render (the server passes a fresh array each time).
  const sig = contests
    .map((c) => `${c.type}:${c.contestId}:${c.type === "auction" ? c.tournamentId ?? "" : ""}`)
    .join("|");

  useEffect(() => {
    // A home refresh re-renders the entire route, so coalesce bursts (e.g. rapid auction
    // bids) into one refresh shortly after the last event instead of one per event.
    let t: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => router.refresh(), 400);
    };
    const unsubs = contests.map((c) =>
      c.type === "pickem"
        ? subscribeToPickem(c.contestId, refresh)
        : c.type === "props"
          ? subscribeToProps(c.contestId, refresh)
          : subscribeToAuction(c.contestId, c.tournamentId, refresh),
    );
    return () => { if (t) clearTimeout(t); for (const u of unsubs) u(); };
    // contests is reconstructed from `sig`; depending on it directly would re-run every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, router]);

  return null;
}
