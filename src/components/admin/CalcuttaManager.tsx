"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { BottomDrawer } from "@/components/admin/BottomDrawer";

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

interface CalcuttaParticipant {
  id: string;
  user_id: string;
  auction_order: number | null;
  bid_amount: number | null;
  sold_at: string | null;
  owner_id: string | null;
  user: ParticipantUser | null;
  owner: ParticipantOwner | null;
}

interface LinkedContest {
  id: string;
  name: string;
  contest_type: string;
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

type Tab = "order" | "prizes" | "auction";

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

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Drag state (mouse + touch)
  const [dragIndex, setDragIndex] = useState<number | null>(null);
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
    const res = await fetch(`/api/admin/calcutta?contest_id=${cId}`);
    const data = await res.json();
    setParticipants(data.participants || []);
    setPrizes(data.prizes || []);
    setActiveOrder(data.active_order);
    setAllUsers(data.allUsers || []);
    setTripContests(data.tripContests || []);
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

  // Navigate to specific participant
  async function handleGoTo(order: number) {
    const p = participants.find((pp) => pp.auction_order === order);
    if (!p) return;
    await setActiveOrderNum(order);
    if (p.bid_amount != null) {
      setBidAmount(String(p.bid_amount));
      setBidOwnerId(p.owner_id || "");
    } else {
      setBidAmount("");
      setBidOwnerId("");
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

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {(["order", "prizes", "auction"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${
              tab === t
                ? "bg-white text-purple-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "order" ? "Auction Order" : t === "prizes" ? "Prize Breakdown" : "Live Auction"}
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
            <div className="space-y-1" ref={listRef}>
              {participants.map((p, index) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null) {
                      handleDragEnd(dragIndex, index);
                      setDragIndex(null);
                    }
                  }}
                  onTouchStart={(e) => {
                    // Only start drag from the grip handle area (first 40px)
                    const touch = e.touches[0];
                    const rect = e.currentTarget.getBoundingClientRect();
                    if (touch.clientX - rect.left > 40) return;
                    touchStartY.current = touch.clientY;
                    touchCurrentIndex.current = index;
                    setDragIndex(index);
                  }}
                  onTouchMove={(e) => {
                    if (dragIndex === null || !listRef.current) return;
                    e.preventDefault();
                    const touch = e.touches[0];
                    const items = listRef.current.children;
                    for (let i = 0; i < items.length; i++) {
                      const rect = items[i].getBoundingClientRect();
                      if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                        touchCurrentIndex.current = i;
                        break;
                      }
                    }
                  }}
                  onTouchEnd={() => {
                    if (dragIndex !== null && touchCurrentIndex.current !== null) {
                      handleDragEnd(dragIndex, touchCurrentIndex.current);
                    }
                    setDragIndex(null);
                    touchStartY.current = null;
                    touchCurrentIndex.current = null;
                  }}
                  className={`flex items-center gap-2 bg-white border rounded-xl px-3 py-2.5 ${
                    dragIndex === index ? "opacity-50 border-purple-300" : "border-gray-200"
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

      {/* PRIZES TAB */}
      {tab === "prizes" && (
        <div className="space-y-3">
          {prizes.length > 0 && (
            <div className="space-y-1.5">
              {prizes.map((prize) => {
                const baseName = prize.linked_contest?.name || prize.prize_name || "Unknown";
                const displayName = prize.place === 1
                  ? `${baseName} Champion`
                  : prize.place === 2
                  ? `${baseName} Runner-Up`
                  : `${baseName} ${ordinal(prize.place)} Place`;
                const perPlayerPct = prize.per_player ? prize.percentage / prize.player_count : null;
                return (
                <div key={prize.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {displayName}
                    </p>
                    {prize.per_player && perPlayerPct != null && (
                      <p className="text-xs text-gray-400">
                        Split across {prize.player_count} players
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-bold text-purple-700 flex-shrink-0">
                    {prize.percentage}%
                  </span>
                  {totalPool > 0 && (
                    <span className="text-xs text-gray-400 flex-shrink-0 w-16 text-right">
                      ${((totalPool * prize.percentage) / 100).toFixed(0)}
                    </span>
                  )}
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
                    className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() =>
                      setConfirmModal({
                        title: "Delete Prize",
                        message: `Delete "${prize.prize_name}" from the prize breakdown?`,
                        onConfirm: () => handleDeletePrize(prize.id),
                      })
                    }
                    className="text-gray-300 hover:text-red-500 flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                );
              })}

              <div className={`flex items-center justify-between px-3 py-2 rounded-xl ${
                Math.abs(totalPercentage - 100) < 0.01 ? "bg-green-50" : "bg-yellow-50"
              }`}>
                <span className="text-sm font-medium text-gray-700">Total</span>
                <span className={`text-sm font-bold ${
                  Math.abs(totalPercentage - 100) < 0.01 ? "text-green-700" : "text-yellow-700"
                }`}>
                  {totalPercentage.toFixed(1)}%
                  {Math.abs(totalPercentage - 100) >= 0.01 && " (should be 100%)"}
                </span>
              </div>
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
              return (
                <button
                  key={p.id}
                  onClick={() => handleGoTo(p.auction_order!)}
                  className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-xl transition-colors ${
                    isActive
                      ? "bg-purple-100 border border-purple-300"
                      : p.sold_at
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
                  {p.sold_at && (
                    <>
                      <span className="text-xs text-green-700 font-medium">
                        ${Number(p.bid_amount).toFixed(0)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {p.owner?.display_name}
                      </span>
                    </>
                  )}
                  {isActive && !p.sold_at && (
                    <span className="text-xs font-medium text-purple-700 bg-purple-200 px-1.5 py-0.5 rounded">
                      LIVE
                    </span>
                  )}
                </button>
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
