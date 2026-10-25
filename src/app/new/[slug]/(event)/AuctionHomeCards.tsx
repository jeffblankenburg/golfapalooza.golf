import Link from "next/link";
import { v2ServerClient } from "@/lib/v2/supabase";
import styles from "./SquaresHomeCards.module.css";

/** Small "this is an Auction" marker (gavel glyph + label), matching the admin type badge. */
function AuctionTag() {
  return (
    <span className={styles.typeTag}>
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h9" />
        <path d="M7 11l6 6" />
        <path d="M10.5 7.5l6 6" />
        <path d="M13 5l6 6" />
        <path d="M8.5 9l4-4" />
      </svg>
      Auction
    </span>
  );
}

const money = (cents: number) => {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
};

/**
 * Home-page Auction cards — one per set-up pool (group-scoped or on the active event),
 * showing the viewer's lots and a status badge. Mirrors the Pick'em/Squares home card;
 * links to the shared contest detail (the member board).
 */
export default async function AuctionHomeCards({ orgId, userId, slug, eventId }: { orgId: string; userId: string; slug: string; eventId: string }) {
  const supabase = await v2ServerClient();
  const { data: contests } = await supabase
    .from("v2_contests")
    .select("id, name, event_id, config")
    .eq("org_id", orgId)
    .eq("contest_type", "auction")
    .eq("status", "active")
    .or(`event_id.is.null,event_id.eq.${eventId}`);
  const live = (contests ?? []).filter((c) => (c.config as { tournament_id?: string } | null)?.tournament_id);
  if (live.length === 0) return null;

  const ids = live.map((c) => c.id);
  const { data: ownRows } = await supabase
    .from("v2_auction_teams").select("contest_id, user_id, bid_cents").in("contest_id", ids);
  const rows = ownRows ?? [];

  const cards = live.map((c) => {
    const cfg = (c.config as { entry_cents?: number; on_block_entity_id?: string; auction_complete?: boolean } | null) ?? {};
    const mine = rows.filter((r) => r.contest_id === c.id && r.user_id === userId && ((r.bid_cents as number) || 0) > 0).length;
    const badge = cfg.auction_complete ? "Final" : cfg.on_block_entity_id ? "Live" : "View";
    const entry = Number(cfg.entry_cents) || 0;
    return (
      <Link key={c.id} href={`/new/${slug}/contests/${c.id}`} className={styles.draftCard}>
        <div className={styles.draftTop}>
          <span className={styles.name}>{c.name || "Auction"}</span>
          <span className={styles.badge}>{badge}</span>
        </div>
        <AuctionTag />
        <div className={styles.draftStats}>
          <span><strong>{mine}</strong> {mine === 1 ? "lot" : "lots"}</span>
          {entry > 0 && <span><strong>{money(entry)}</strong> entry</span>}
        </div>
      </Link>
    );
  });

  return <>{cards}</>;
}
