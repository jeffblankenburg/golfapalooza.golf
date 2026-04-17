"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { BottomDrawer } from "@/components/admin/BottomDrawer";
import { CollapsibleSection } from "@/components/admin/CollapsibleSection";

interface ParticipantUser {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  birthday?: string | null;
}

interface ParticipantOwner {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface OwnershipRecord {
  id: string;
  owner_id: string;
  share_pct: number;
  amount_paid: number;
  is_buyback: boolean;
  owner: ParticipantOwner | null;
}

interface CalcuttaParticipant {
  id: string;
  user_id: string;
  auction_order: number | null;
  bid_amount: number | null;
  sold_at: string | null;
  owner_id: string | null;
  user: ParticipantUser | null;
  owner: ParticipantOwner | null;
  ownerships: OwnershipRecord[];
}

interface LinkedContest {
  id: string;
  name: string;
  contest_type: string;
}

interface PrizeWinnerOwner {
  owner_id: string;
  display_name: string;
  avatar_url: string | null;
  share_pct: number;
}

interface PrizeWinner {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  owners: PrizeWinnerOwner[];
}

interface CalcuttaPrize {
  id: string;
  contest_id: string;
  linked_contest_id: string | null;
  prize_name: string | null;
  place: number;
  percentage: number;
  sort_order: number;
  per_player: boolean;
  player_count: number;
  linked_contest: LinkedContest | null;
  winners?: PrizeWinner[];
  locked?: boolean;
}

interface TripContest {
  id: string;
  name: string;
  contest_type: string;
  day_number: number | null;
  sort_order: number;
}

interface EventUser {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

type Tab = "order" | "auction" | "summary";

export function CalcuttaManager({ tripId }: { tripId: string }) {
  const [contestId, setContestId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<CalcuttaParticipant[]>([]);
  const [prizes, setPrizes] = useState<CalcuttaPrize[]>([]);
  const [activeOrder, setActiveOrder] = useState<number | null>(null);
  const [allUsers, setAllUsers] = useState<EventUser[]>([]);
  const [tripContests, setTripContests] = useState<TripContest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("order");
  const [error, setError] = useState("");

  // Prize form
  const [prizeLinkedContestId, setPrizeLinkedContestId] = useState("");
  const [prizePlace, setPrizePlace] = useState(1);
  const [prizePercentage, setPrizePercentage] = useState("");
  const [prizePerPlayer, setPrizePerPlayer] = useState(false);
  const [prizePlayerCount, setPrizePlayerCount] = useState("4");
  const [editingPrizeId, setEditingPrizeId] = useState<string | null>(null);
  const [prizeDrawerOpen, setPrizeDrawerOpen] = useState(false);

  // Auction state
  const [bidAmount, setBidAmount] = useState("");
  const [bidOwnerId, setBidOwnerId] = useState("");
  const [bidBuyback, setBidBuyback] = useState(false);

  // Summary state
  const [paidBuyers, setPaidBuyers] = useState<Set<string>>(new Set());
  const [paidWinners, setPaidWinners] = useState<Set<string>>(new Set()); // "prizeId:ownerId"
  const [prizesOpen, setPrizesOpen] = useState(false);
  const [summarySort, setSummarySort] = useState<"amount" | "name">("name");
  const [expandedBuyers, setExpandedBuyers] = useState<Set<string>>(new Set());

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);


  // Drag state (mouse + touch)
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [touchPreview, setTouchPreview] = useState<{ name: string; y: number } | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchCurrentIndex = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Find the calcutta contest
  const fetchContest = useCallback(async () => {
    const res = await fetch(`/api/admin/contests?trip_id=${tripId}`);
    const data = await res.json();
    const calcutta = (data.contests || []).find(
      (c: { contest_type: string }) => c.contest_type === "calcutta"
    );
    if (calcutta) setContestId(calcutta.id);
    return calcutta?.id || null;
  }, [tripId]);

  // Fetch calcutta data
  const fetchData = useCallback(async (cId: string) => {
    const [calcuttaRes, winnersRes] = await Promise.all([
      fetch(`/api/admin/calcutta?contest_id=${cId}`),
      fetch(`/api/admin/contest-winners?contest_id=${cId}`),
    ]);
    const data = await calcuttaRes.json();
    setParticipants(data.participants || []);
    setActiveOrder(data.active_order);
    setAllUsers(data.allUsers || []);
    setTripContests(data.tripContests || []);
    setPaidBuyers(new Set(data.paidBuyers || []));
    setPaidWinners(new Set(data.winnerPaid || []));

    // Build ownership lookup from participants: user_id -> owners
    const participants = data.participants || [];
    const ownersByUser: Record<string, PrizeWinnerOwner[]> = {};
    for (const p of participants) {
      if (p.ownerships && p.ownerships.length > 0) {
        ownersByUser[p.user_id] = p.ownerships.map((o: { owner_id: string; share_pct: number; owner: { display_name: string; avatar_url: string | null } | null }) => ({
          owner_id: o.owner_id,
          display_name: o.owner?.display_name || "Unknown",
          avatar_url: o.owner?.avatar_url || null,
          share_pct: o.share_pct,
        }));
      } else if (p.owner_id && p.owner) {
        ownersByUser[p.user_id] = [{
          owner_id: p.owner_id,
          display_name: p.owner.display_name,
          avatar_url: p.owner.avatar_url,
          share_pct: 100,
        }];
      }
    }

    // Merge winner data into prizes
    const winnersData = winnersRes.ok ? await winnersRes.json() : { prizes: [] };
    const winnersByPrize: Record<string, { winners: PrizeWinner[]; locked: boolean }> = {};
    for (const wp of winnersData.prizes || []) {
      winnersByPrize[wp.id] = {
        winners: (wp.winners || []).map((w: { user: { display_name: string; avatar_url: string | null } | null; user_id: string }) => ({
          user_id: w.user_id,
          display_name: w.user?.display_name || "Unknown",
          avatar_url: w.user?.avatar_url || null,
          owners: ownersByUser[w.user_id] || [],
        })),
        locked: !!(wp.linked_contest?.winners_locked_at),
      };
    }

    const enrichedPrizes = (data.prizes || []).map((p: CalcuttaPrize) => ({
      ...p,
      winners: winnersByPrize[p.id]?.winners || [],
      locked: winnersByPrize[p.id]?.locked || false,
    }));
    setPrizes(enrichedPrizes);
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const cId = await fetchContest();
      if (cId) await fetchData(cId);
      setLoading(false);
    }
    init();
  }, [fetchContest, fetchData]);

  // Refresh when participants are toggled in ContestParticipants
  useEffect(() => {
    function handleParticipantsChanged() {
      if (contestId) fetchData(contestId);
    }
    window.addEventListener("contest-participants-changed", handleParticipantsChanged);
    return () => window.removeEventListener("contest-participants-changed", handleParticipantsChanged);
  }, [contestId, fetchData]);

  // Reorder via drag
  async function handleDragEnd(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx || !contestId) return;
    const newList = [...participants];
    const [moved] = newList.splice(fromIdx, 1);
    newList.splice(toIdx, 0, moved);

    const reordered = newList.map((p, i) => ({
      ...p,
      auction_order: i + 1,
    }));
    setParticipants(reordered);

    await fetch("/api/admin/calcutta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reorder",
        order: reordered.map((p) => ({ id: p.id, auction_order: p.auction_order })),
      }),
    });
  }

  // Move up/down
  async function moveParticipant(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= participants.length) return;
    await handleDragEnd(index, targetIndex);
  }

  // Save prize
  async function handleSavePrize() {
    if (!contestId || !prizeLinkedContestId || !prizePercentage) return;
    setSaving(true);
    setError("");

    const body: Record<string, unknown> = {
      contest_id: contestId,
      linked_contest_id: prizeLinkedContestId,
      place: prizePlace,
      percentage: parseFloat(prizePercentage),
      per_player: prizePerPlayer,
      player_count: prizePerPlayer ? parseInt(prizePlayerCount) || 4 : 1,
      sort_order: editingPrizeId
        ? prizes.find((p) => p.id === editingPrizeId)?.sort_order || 0
        : prizes.length,
    };
    if (editingPrizeId) body.id = editingPrizeId;

    const res = await fetch("/api/admin/calcutta/prizes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      setError("Failed to save prize");
    } else {
      setPrizeDrawerOpen(false);
      setPrizeLinkedContestId("");
      setPrizePlace(1);
      setPrizePercentage("");
      setPrizePerPlayer(false);
      setPrizePlayerCount("4");
      setEditingPrizeId(null);
    }

    await fetchData(contestId);
    setSaving(false);
  }

  // Delete prize
  async function handleDeletePrize(prizeId: string) {
    if (!contestId) return;
    setSaving(true);
    await fetch("/api/admin/calcutta/prizes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: prizeId }),
    });
    await fetchData(contestId);
    setSaving(false);
  }

  // Start/resume auction
  async function handleStartAuction() {
    if (!contestId || participants.length === 0) return;
    const firstUnsold = participants.find((p) => !p.sold_at);
    const order = firstUnsold ? firstUnsold.auction_order : participants[0].auction_order;
    await setActiveOrderNum(order);
    setTab("auction");
  }

  // Set active order
  async function setActiveOrderNum(num: number | null) {
    if (!contestId) return;
    setActiveOrder(num);
    await fetch("/api/admin/calcutta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_active", contest_id: contestId, active_order: num }),
    });
  }

  // Record bid and advance
  async function handleRecordBid() {
    if (!contestId) return;
    const current = participants.find((p) => p.auction_order === activeOrder);
    if (!current) return;

    setSaving(true);
    setError("");

    const amount = bidAmount ? parseFloat(bidAmount) : null;

    await fetch("/api/admin/calcutta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "bid",
        participant_id: current.id,
        bid_amount: amount,
        owner_id: bidOwnerId || null,
        buyback: bidBuyback,
      }),
    });

    // Advance to next unsold
    const next = participants.find(
      (p) => (p.auction_order || 0) > (activeOrder || 0) && !p.sold_at && p.id !== current.id
    );
    if (next) {
      await setActiveOrderNum(next.auction_order);
    } else {
      await setActiveOrderNum(null);
    }

    setBidAmount("");
    setBidOwnerId("");
    setBidBuyback(false);
    await fetchData(contestId);
    setSaving(false);
  }

  // Reset auction
  async function handleResetAuction() {
    if (!contestId) return;
    setSaving(true);
    await fetch("/api/admin/calcutta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", contest_id: contestId }),
    });
    setActiveOrder(null);
    setBidAmount("");
    setBidOwnerId("");
    await fetchData(contestId);
    setSaving(false);
  }

  // End auction
  async function handleEndAuction() {
    if (!contestId) return;
    setSaving(true);
    await fetch("/api/admin/calcutta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end_auction", contest_id: contestId }),
    });
    setActiveOrder(null);
    await fetchData(contestId);
    setSaving(false);
  }

  // Toggle buyer paid status
  async function handleTogglePaid(userId: string) {
    if (!contestId) return;
    // Optimistic update
    setPaidBuyers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
    await fetch("/api/admin/calcutta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_paid", contest_id: contestId, user_id: userId }),
    });
  }

  async function handleToggleWinnerPaid(prizeId: string, ownerId: string) {
    if (!contestId) return;
    const key = `${prizeId}:${ownerId}`;
    setPaidWinners((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    await fetch("/api/admin/calcutta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_winner_paid", prize_id: prizeId, owner_id: ownerId }),
    });
  }

  // Toggle buyback after the fact
  async function handleBuyback(participantId: string) {
    if (!contestId) return;
    setSaving(true);
    await fetch("/api/admin/calcutta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "buyback", participant_id: participantId }),
    });
    await fetchData(contestId);
    setSaving(false);
  }

  async function handleUndoBuyback(participantId: string) {
    if (!contestId) return;
    setSaving(true);
    await fetch("/api/admin/calcutta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "undo_buyback", participant_id: participantId }),
    });
    await fetchData(contestId);
    setSaving(false);
  }

  // Navigate to specific participant
  async function handleGoTo(order: number) {
    const p = participants.find((pp) => pp.auction_order === order);
    if (!p) return;
    await setActiveOrderNum(order);
    if (p.bid_amount != null) {
      setBidAmount(String(p.bid_amount));
      setBidOwnerId(p.owner_id || "");
      setBidBuyback(p.ownerships?.some((o) => o.is_buyback) || false);
    } else {
      setBidAmount("");
      setBidOwnerId("");
      setBidBuyback(false);
    }
  }

  const totalPercentage = prizes.reduce((sum, p) => sum + Number(p.percentage), 0);
  const totalPool = participants.reduce((sum, p) => sum + (Number(p.bid_amount) || 0), 0);
  const allSold = participants.length > 0 && participants.every((p) => p.sold_at);
  const current = participants.find((p) => p.auction_order === activeOrder);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!contestId) {
    return (
      <p className="text-sm text-gray-400 py-4">
        No Calcutta contest found. Create one in Contests first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>
      )}

      {/* Prize Breakdown — percentages only */}
      <CollapsibleSection
        title="Prize Breakdown"
        summary={prizes.length > 0
          ? `${prizes.length} prize${prizes.length !== 1 ? "s" : ""} · ${totalPercentage.toFixed(0)}%`
          : "No prizes configured"
        }
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        iconColor="text-purple-700"
      >
        <div className="space-y-3">
          {prizes.length > 0 && (
            <div className="space-y-1">
              {prizes.map((prize) => {
                const baseName = prize.linked_contest?.name || prize.prize_name || "Unknown";
                const displayName = prize.place === 1
                  ? `${baseName} Champion`
                  : prize.place === 2
                  ? `${baseName} Runner-Up`
                  : `${baseName} ${ordinal(prize.place)} Place`;
                const payout = totalPool > 0 ? (totalPool * prize.percentage) / 100 : 0;
                return (
                  <div key={prize.id} className="flex items-center justify-between rounded-lg px-3 py-2">
                    <p className="text-sm font-medium text-gray-900 truncate flex-1 min-w-0">{displayName}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {payout > 0 && <span className="text-sm font-semibold text-gray-700">${payout.toFixed(0)}</span>}
                      <span className="text-xs text-gray-400 w-10 text-right">{prize.percentage}%</span>
                      <button
                        onClick={() => {
                          setEditingPrizeId(prize.id);
                          setPrizeLinkedContestId(prize.linked_contest_id || "");
                          setPrizePlace(prize.place);
                          setPrizePercentage(String(prize.percentage));
                          setPrizePerPlayer(prize.per_player);
                          setPrizePlayerCount(String(prize.player_count));
                          setPrizeDrawerOpen(true);
                        }}
                        className="text-gray-300 hover:text-gray-600"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Total bar */}
          {prizes.length > 0 && (
            <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm ${
              Math.abs(totalPercentage - 100) < 0.01 ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
            }`}>
              <span className="font-medium">Total</span>
              <span className="font-bold">
                {totalPool > 0 && <span className="mr-2">${totalPool.toFixed(0)}</span>}
                {totalPercentage.toFixed(1)}%
                {Math.abs(totalPercentage - 100) >= 0.01 && " (should be 100%)"}
              </span>
            </div>
          )}

          <button
            onClick={() => {
              setEditingPrizeId(null);
              setPrizeLinkedContestId("");
              setPrizePlace(1);
              setPrizePercentage("");
              setPrizePerPlayer(false);
              setPrizePlayerCount("4");
              setPrizeDrawerOpen(true);
            }}
            className="w-full py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 transition-colors"
          >
            Add Prize
          </button>
        </div>
      </CollapsibleSection>

      {/* Winners & Payouts */}
      <CollapsibleSection
        title="Winners & Payouts"
        summary={(() => {
          const resolved = prizes.filter((p) => (p.winners?.length || 0) > 0).length;
          return resolved > 0 ? `${resolved}/${prizes.length} resolved` : "No winners yet";
        })()}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        }
        iconColor="text-green-700"
      >
        <div className="space-y-3">
          {prizes.map((prize) => {
            const baseName = prize.linked_contest?.name || prize.prize_name || "Unknown";
            const displayName = prize.place === 1
              ? `${baseName} Champion`
              : prize.place === 2
              ? `${baseName} Runner-Up`
              : `${baseName} ${ordinal(prize.place)} Place`;
            const hasWinners = (prize.winners?.length || 0) > 0;
            const payout = totalPool > 0 ? (totalPool * prize.percentage) / 100 : 0;
            const winnerCount = prize.winners?.length || 1;
            const perPlayerPayout = payout / winnerCount;

            return (
              <div key={prize.id} className={`rounded-lg px-3 py-2 ${hasWinners ? "bg-emerald-50" : "bg-gray-50"}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {displayName} <span className="text-gray-400 font-normal">({prize.percentage}%)</span>
                  </p>
                  {payout > 0 && <span className="text-sm font-bold text-green-700">${payout.toFixed(0)}</span>}
                </div>
                {hasWinners ? (
                  <div className="space-y-1.5">
                    {(() => {
                      // Aggregate payouts per owner across all winners for this prize
                      const ownerMap = new Map<string, { owner_id: string; display_name: string; avatar_url: string | null; payout: number }>();
                      for (const w of prize.winners!) {
                        for (const o of w.owners) {
                          const existing = ownerMap.get(o.owner_id);
                          const ownerPayout = perPlayerPayout * (o.share_pct / 100);
                          if (existing) {
                            existing.payout += ownerPayout;
                          } else {
                            ownerMap.set(o.owner_id, {
                              owner_id: o.owner_id,
                              display_name: o.display_name,
                              avatar_url: o.avatar_url,
                              payout: ownerPayout,
                            });
                          }
                        }
                      }
                      const owners = Array.from(ownerMap.values());
                      return owners.map((o) => {
                        const isPaid = paidWinners.has(`${prize.id}:${o.owner_id}`);
                        return (
                          <div key={o.owner_id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isPaid}
                              onChange={() => handleToggleWinnerPaid(prize.id, o.owner_id)}
                              className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 flex-shrink-0"
                            />
                            <span className="text-sm font-bold text-green-700 w-12 text-right flex-shrink-0">${o.payout.toFixed(0)}</span>
                            {o.avatar_url ? (
                              <img src={o.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                            ) : (
                              <span className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center text-[9px] font-bold text-purple-700">
                                {(o.display_name || "?")[0].toUpperCase()}
                              </span>
                            )}
                            <span className={`text-sm font-semibold flex-1 ${isPaid ? "text-gray-400 line-through" : "text-gray-900"}`}>{o.display_name}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Pending</p>
                )}
              </div>
            );
          })}
        </div>
      </CollapsibleSection>

      {/* Auction */}
      <CollapsibleSection
        title="Auction"
        summary={allSold ? `${participants.length} sold · $${totalPool.toFixed(0)} pool` : `${participants.filter((p) => p.sold_at).length}/${participants.length} sold`}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        }
        iconColor="text-purple-700"
      >
        <div className="space-y-3">

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {(["order", "auction", "summary"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${
              tab === t
                ? "bg-white text-purple-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "order" ? "Auction Order" : t === "auction" ? "Live Auction" : "Summary"}
          </button>
        ))}
      </div>

      {/* ORDER TAB */}
      {tab === "order" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            {participants.length} participant{participants.length !== 1 ? "s" : ""}. Drag to reorder.
          </p>

          {participants.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              No participants in the Calcutta contest yet. Add them via Contests.
            </p>
          ) : (
            <div className="space-y-1 relative" ref={listRef}>
              {/* Floating touch preview */}
              {touchPreview && (
                <div
                  className="fixed left-4 right-4 z-50 pointer-events-none"
                  style={{ top: touchPreview.y - 20 }}
                >
                  <div className="bg-purple-600 text-white rounded-xl px-4 py-2 shadow-lg text-sm font-medium text-center opacity-90">
                    {touchPreview.name}
                  </div>
                </div>
              )}
              {participants.map((p, index) => (
                <div key={p.id}>
                  {/* Drop indicator line */}
                  {dropTargetIndex === index && dragIndex !== null && dragIndex !== index && (
                    <div className="h-1 bg-purple-500 rounded-full mx-2 -mb-0.5" />
                  )}
                <div
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropTargetIndex(index);
                  }}
                  onDragLeave={() => {
                    setDropTargetIndex((prev) => prev === index ? null : prev);
                  }}
                  onDrop={() => {
                    if (dragIndex !== null) {
                      handleDragEnd(dragIndex, index);
                      setDragIndex(null);
                      setDropTargetIndex(null);
                    }
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDropTargetIndex(null);
                  }}
                  onTouchStart={(e) => {
                    const touch = e.touches[0];
                    const rect = e.currentTarget.getBoundingClientRect();
                    if (touch.clientX - rect.left > 40) return;
                    touchStartY.current = touch.clientY;
                    touchCurrentIndex.current = index;
                    setDragIndex(index);
                    setDropTargetIndex(index);
                    setTouchPreview({
                      name: p.user?.display_name || "Unknown",
                      y: touch.clientY,
                    });
                  }}
                  onTouchMove={(e) => {
                    if (dragIndex === null || !listRef.current) return;
                    e.preventDefault();
                    const touch = e.touches[0];
                    setTouchPreview((prev) => prev ? { ...prev, y: touch.clientY } : null);
                    const items = listRef.current.querySelectorAll("[data-drag-item]");
                    for (let i = 0; i < items.length; i++) {
                      const rect = items[i].getBoundingClientRect();
                      const midY = rect.top + rect.height / 2;
                      if (touch.clientY < midY) {
                        touchCurrentIndex.current = i;
                        setDropTargetIndex(i);
                        return;
                      }
                    }
                    touchCurrentIndex.current = items.length - 1;
                    setDropTargetIndex(items.length - 1);
                  }}
                  onTouchEnd={() => {
                    if (dragIndex !== null && touchCurrentIndex.current !== null) {
                      handleDragEnd(dragIndex, touchCurrentIndex.current);
                    }
                    setDragIndex(null);
                    setDropTargetIndex(null);
                    setTouchPreview(null);
                    touchStartY.current = null;
                    touchCurrentIndex.current = null;
                  }}
                  data-drag-item
                  className={`flex items-center gap-2 bg-white border-2 rounded-xl px-3 py-2.5 transition-colors ${
                    dragIndex === index
                      ? "opacity-40 border-purple-300 bg-purple-50"
                      : dropTargetIndex === index && dragIndex !== null && dragIndex !== index
                      ? "border-purple-400 bg-purple-50"
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex flex-col gap-0.5 text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 6a2 2 0 112 0 2 2 0 01-2 0zm8 0a2 2 0 112 0 2 2 0 01-2 0zm-8 6a2 2 0 112 0 2 2 0 01-2 0zm8 0a2 2 0 112 0 2 2 0 01-2 0zm-8 6a2 2 0 112 0 2 2 0 01-2 0zm8 0a2 2 0 112 0 2 2 0 01-2 0z" />
                    </svg>
                  </div>

                  <span className="text-sm font-bold text-gray-400 w-6 text-center flex-shrink-0">
                    {p.auction_order}
                  </span>

                  {p.user?.avatar_url ? (
                    <img src={p.user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-sm font-bold flex-shrink-0">
                      {(p.user?.display_name || "?")[0].toUpperCase()}
                    </span>
                  )}

                  <span className="text-sm font-medium text-gray-900 flex-1 min-w-0 truncate">
                    {p.user?.display_name || "Unknown"}
                  </span>

                  {p.sold_at && (
                    <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full flex-shrink-0">
                      ${Number(p.bid_amount).toFixed(0)}
                    </span>
                  )}

                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => moveParticipant(index, "up")}
                      disabled={index === 0}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveParticipant(index, "down")}
                      disabled={index === participants.length - 1}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
                </div>
              ))}
            </div>
          )}

          {participants.length > 0 && (
            <button
              onClick={handleStartAuction}
              className="w-full py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors"
            >
              {activeOrder != null ? "Resume Auction" : "Start Auction"}
            </button>
          )}
        </div>
      )}

      {/* AUCTION TAB */}
      {tab === "auction" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-purple-50 rounded-xl px-3 py-2.5">
            <div className="flex-1">
              <p className="text-xs text-purple-500 uppercase font-semibold">Pool</p>
              <p className="text-lg font-bold text-purple-900">${totalPool.toFixed(0)}</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-xs text-purple-500 uppercase font-semibold">Sold</p>
              <p className="text-lg font-bold text-purple-900">
                {participants.filter((p) => p.sold_at).length} / {participants.length}
              </p>
            </div>
            <div className="flex-1 text-right">
              <p className="text-xs text-purple-500 uppercase font-semibold">Active</p>
              <p className="text-lg font-bold text-purple-900">
                {activeOrder != null ? `#${activeOrder}` : allSold ? "Done" : "—"}
              </p>
            </div>
          </div>

          {current && (
            <div className="bg-white border-2 border-purple-300 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                {current.user?.avatar_url ? (
                  <img src={current.user.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover" />
                ) : (
                  <span className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-xl font-bold">
                    {(current.user?.display_name || "?")[0].toUpperCase()}
                  </span>
                )}
                <div>
                  <p className="text-lg font-bold text-gray-900">
                    {current.user?.display_name}
                  </p>
                  <p className="text-sm text-gray-400">
                    #{current.auction_order} of {participants.length}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Bid Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="number"
                      step="1"
                      placeholder="0"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      autoFocus
                      className="w-full text-lg font-bold border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Buyer</label>
                  <select
                    value={bidOwnerId}
                    onChange={(e) => setBidOwnerId(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Select buyer...</option>
                    {allUsers
                      .sort((a, b) => a.display_name.localeCompare(b.display_name))
                      .map((u) => (
                        <option key={u.user_id} value={u.user_id}>
                          {u.display_name}
                          {u.user_id === current.user_id ? " (self)" : ""}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Buyback checkbox — only show when buyer is not the player */}
              {bidOwnerId && bidOwnerId !== current.user_id && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bidBuyback}
                    onChange={(e) => setBidBuyback(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    {current.user?.display_name || "Player"} buys 50%
                  </span>
                </label>
              )}

              <button
                onClick={handleRecordBid}
                disabled={saving || !bidAmount || !bidOwnerId}
                className="w-full py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : "Save & Next"}
              </button>
            </div>
          )}

          {!current && activeOrder == null && (
            <div className="text-center py-4">
              {allSold ? (
                <div className="space-y-2">
                  <p className="text-lg font-bold text-green-700">Auction Complete!</p>
                  <p className="text-sm text-gray-500">Total Pool: ${totalPool.toFixed(2)}</p>
                </div>
              ) : (
                <button
                  onClick={handleStartAuction}
                  className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors"
                >
                  Start Auction
                </button>
              )}
            </div>
          )}

          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">All Participants</p>
            {participants.map((p) => {
              const isActive = p.auction_order === activeOrder;
              const isSold = !!p.sold_at;
              const hasBuyback = p.ownerships?.some((o) => o.is_buyback);
              const canBuyback = isSold && !hasBuyback && p.owner_id !== p.user_id;
              return (
                <div key={p.id} className="space-y-0.5">
                  <button
                    onClick={() => handleGoTo(p.auction_order!)}
                    className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-xl transition-colors ${
                      isActive
                        ? "bg-purple-100 border border-purple-300"
                        : isSold
                        ? "bg-green-50"
                        : "bg-gray-50 hover:bg-gray-100"
                    }`}
                  >
                    <span className="text-xs font-bold text-gray-400 w-5">
                      {p.auction_order}
                    </span>
                    {p.user?.avatar_url ? (
                      <img src={p.user.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-[10px] font-bold">
                        {(p.user?.display_name || "?")[0].toUpperCase()}
                      </span>
                    )}
                    <span className="text-sm text-gray-900 flex-1 truncate">
                      {p.user?.display_name}
                    </span>
                    {isSold && (
                      <span className="text-xs text-green-700 font-medium">
                        ${Number(p.bid_amount).toFixed(0)}
                      </span>
                    )}
                    {isActive && !isSold && (
                      <span className="text-xs font-medium text-purple-700 bg-purple-200 px-1.5 py-0.5 rounded">
                        LIVE
                      </span>
                    )}
                  </button>
                  {/* Ownership details + buyback toggle */}
                  {isSold && (
                    <div className="ml-8 pl-3 border-l-2 border-gray-200 space-y-0.5">
                      {p.ownerships && p.ownerships.length > 0 && p.ownerships.map((o) => (
                        <div key={o.id} className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="font-medium">{o.owner?.display_name || "Unknown"}</span>
                          <span className="text-gray-300">·</span>
                          <span>{o.share_pct}%</span>
                          <span className="text-gray-300">·</span>
                          <span>${Number(o.amount_paid).toFixed(0)}</span>
                          {o.is_buyback && (
                            <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1 py-0.5 rounded">
                              BUYBACK
                            </span>
                          )}
                        </div>
                      ))}
                      {canBuyback && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleBuyback(p.id); }}
                          disabled={saving}
                          className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        >
                          + {p.user?.display_name} buys 50%
                        </button>
                      )}
                      {hasBuyback && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleUndoBuyback(p.id); }}
                          disabled={saving}
                          className="text-[11px] font-semibold text-red-500 hover:text-red-700 disabled:opacity-50"
                        >
                          Remove buyback
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 pt-2 border-t border-gray-200">
            <button
              onClick={() =>
                setConfirmModal({
                  title: "Reset Auction",
                  message: "This will clear ALL bids, owners, and sold status. The auction will return to its pre-start state. This cannot be undone.",
                  onConfirm: handleResetAuction,
                })
              }
              disabled={saving}
              className="flex-1 py-2.5 text-sm font-semibold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              Reset Auction
            </button>
            <button
              onClick={() =>
                setConfirmModal({
                  title: "End Auction",
                  message: "This will close the auction. Are you sure?",
                  onConfirm: handleEndAuction,
                })
              }
              disabled={saving}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-gray-800 rounded-xl hover:bg-gray-900 disabled:opacity-50 transition-colors"
            >
              End Auction
            </button>
          </div>
        </div>
      )}

      {/* SUMMARY TAB */}
      {tab === "summary" && (() => {
        // Aggregate by buyer: total loozers bought, total spent, paid status, owned loozers
        interface OwnedLoozer { name: string; amount: number; sharePct: number; isBuyback: boolean }
        const buyerMap = new Map<string, { userId: string; displayName: string; avatarUrl: string | null; count: number; totalSpent: number; loozers: OwnedLoozer[] }>();
        for (const p of participants) {
          if (!p.sold_at) continue;
          const owners = p.ownerships && p.ownerships.length > 0
            ? p.ownerships
            : p.owner_id
            ? [{ owner_id: p.owner_id, amount_paid: Number(p.bid_amount) || 0, share_pct: 100, is_buyback: false, owner: p.owner }]
            : [];
          for (const o of owners) {
            const loozer: OwnedLoozer = {
              name: p.user?.display_name || "Unknown",
              amount: Number(o.amount_paid) || 0,
              sharePct: Number((o as { share_pct?: number }).share_pct) || 100,
              isBuyback: !!(o as { is_buyback?: boolean }).is_buyback,
            };
            const existing = buyerMap.get(o.owner_id);
            if (existing) {
              existing.count++;
              existing.totalSpent += loozer.amount;
              existing.loozers.push(loozer);
            } else {
              buyerMap.set(o.owner_id, {
                userId: o.owner_id,
                displayName: o.owner?.display_name || "Unknown",
                avatarUrl: o.owner?.avatar_url || null,
                count: 1,
                totalSpent: loozer.amount,
                loozers: [loozer],
              });
            }
          }
        }
        const buyers = Array.from(buyerMap.values()).sort((a, b) =>
          summarySort === "name"
            ? a.displayName.localeCompare(b.displayName)
            : b.totalSpent - a.totalSpent
        );
        const paidCount = buyers.filter((b) => paidBuyers.has(b.userId)).length;

        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-purple-50 rounded-xl px-3 py-2.5">
              <div className="flex-1">
                <p className="text-xs text-purple-500 uppercase font-semibold">Pool</p>
                <p className="text-lg font-bold text-purple-900">${totalPool.toFixed(0)}</p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-xs text-purple-500 uppercase font-semibold">Buyers</p>
                <p className="text-lg font-bold text-purple-900">{buyers.length}</p>
              </div>
              <div className="flex-1 text-right">
                <p className="text-xs text-purple-500 uppercase font-semibold">Paid</p>
                <p className="text-lg font-bold text-purple-900">{paidCount}/{buyers.length}</p>
              </div>
            </div>

            {buyers.length > 0 && (
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setSummarySort("amount")}
                  className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                    summarySort === "amount" ? "bg-white text-purple-700 shadow-sm" : "text-gray-500"
                  }`}
                >
                  By Amount
                </button>
                <button
                  onClick={() => setSummarySort("name")}
                  className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                    summarySort === "name" ? "bg-white text-purple-700 shadow-sm" : "text-gray-500"
                  }`}
                >
                  By Name
                </button>
              </div>
            )}

            {buyers.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No sales yet.</p>
            ) : (
              <div className="space-y-1.5">
                {buyers.map((b) => {
                  const isPaid = paidBuyers.has(b.userId);
                  const isExpanded = expandedBuyers.has(b.userId);
                  return (
                    <div key={b.userId} className={`rounded-xl overflow-hidden ${isPaid ? "bg-green-50" : "bg-gray-50"}`}>
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <button
                          onClick={() => setExpandedBuyers((prev) => {
                            const next = new Set(prev);
                            if (next.has(b.userId)) next.delete(b.userId);
                            else next.add(b.userId);
                            return next;
                          })}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          {b.avatarUrl ? (
                            <img src={b.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <span className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-sm font-bold flex-shrink-0">
                              {b.displayName[0].toUpperCase()}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{b.displayName}</p>
                            <p className="text-xs text-gray-400">
                              {b.count} Loozer{b.count !== 1 ? "s" : ""}
                            </p>
                          </div>
                          <svg
                            className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <span className="text-sm font-bold text-gray-900 flex-shrink-0">
                          ${b.totalSpent.toFixed(0)}
                        </span>
                        <button
                          onClick={() => handleTogglePaid(b.userId)}
                          className={`flex-shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-colors ${
                            isPaid
                              ? "bg-green-600 border-green-600 text-white"
                              : "bg-white border-gray-300 hover:border-gray-400"
                          }`}
                        >
                          {isPaid && (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="px-3 pb-2.5 flex flex-wrap gap-1.5">
                          {b.loozers.map((l, i) => (
                            <span
                              key={i}
                              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                                l.isBuyback
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-purple-100 text-purple-700"
                              }`}
                            >
                              {l.name}
                              {l.sharePct < 100 && (
                                <span className="opacity-60">{l.sharePct}%</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

        </div>
      </CollapsibleSection>

      <BottomDrawer
        open={prizeDrawerOpen}
        onClose={() => {
          setPrizeDrawerOpen(false);
          setEditingPrizeId(null);
          setPrizeLinkedContestId("");
          setPrizePlace(1);
          setPrizePercentage("");
          setPrizePerPlayer(false);
          setPrizePlayerCount("4");
        }}
        title={editingPrizeId ? "Edit Prize" : "Add Prize"}
      >
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="text-xs text-gray-400">Contest</label>
            <select
              value={prizeLinkedContestId}
              onChange={(e) => {
                setPrizeLinkedContestId(e.target.value);
                const c = tripContests.find((tc) => tc.id === e.target.value);
                if (c) {
                  const isTeam = c.contest_type === "scramble" || c.contest_type === "cornhole_doubles";
                  setPrizePerPlayer(isTeam);
                  if (c.contest_type === "scramble") setPrizePlayerCount("4");
                  else if (c.contest_type === "cornhole_doubles") setPrizePlayerCount("2");
                  else setPrizePlayerCount("1");
                }
              }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              autoFocus
            >
              <option value="">Select contest...</option>
              {tripContests.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {tc.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-400">Place</label>
              <select
                value={prizePlace}
                onChange={(e) => setPrizePlace(Number(e.target.value))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value={1}>1st</option>
                <option value={2}>2nd</option>
                <option value={3}>3rd</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400">Total %</label>
              <input
                type="number"
                step="0.5"
                placeholder="%"
                value={prizePercentage}
                onChange={(e) => setPrizePercentage(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prizePerPlayer}
                onChange={(e) => setPrizePerPlayer(e.target.checked)}
                className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
              />
              <span className="text-sm text-gray-700">Per player</span>
            </label>
            {prizePerPlayer && (
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-400">Players:</label>
                <input
                  type="number"
                  min="2"
                  max="8"
                  value={prizePlayerCount}
                  onChange={(e) => setPrizePlayerCount(e.target.value)}
                  className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            )}
          </div>
          <button
            onClick={handleSavePrize}
            disabled={saving || !prizeLinkedContestId || !prizePercentage}
            className="w-full py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : editingPrizeId ? "Update Prize" : "Add Prize"}
          </button>
        </div>
      </BottomDrawer>

      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        onConfirm={() => {
          confirmModal?.onConfirm();
          setConfirmModal(null);
        }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
