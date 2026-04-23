"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "./ConfirmModal";

interface LoozerSummary {
  user_id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  trip_charges: number;
  trip_payments: number;
  trip_balance: number;
  lifetime_charges: number;
  lifetime_payments: number;
  lifetime_balance: number;
}

interface TripTotals {
  total_charges: number;
  total_payments: number;
  total_outstanding: number;
}

interface Transaction {
  id: string;
  created_at: string;
  type: "charge" | "payment";
  source: string;
  description: string;
  amount: number;
  method: string | null;
  notes: string | null;
}

type SortOption = "name" | "balance-desc" | "balance-asc";

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

export function FinancialDashboard({ tripId }: { tripId: string }) {
  const [totals, setTotals] = useState<TripTotals | null>(null);
  const [loozers, setLoozers] = useState<LoozerSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter / sort state
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("name");
  const [showOnlyUnpaid, setShowOnlyUnpaid] = useState(false);

  // Expanded card state
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [ledger, setLedger] = useState<Transaction[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Form state
  const [activeForm, setActiveForm] = useState<
    { userId: string; kind: "payment" | "charge" } | null
  >(null);
  const [formAmount, setFormAmount] = useState("");
  const [formMethod, setFormMethod] = useState("Venmo");
  const [formNotes, setFormNotes] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formChargeType, setFormChargeType] = useState<"charge" | "credit">("charge");
  const [formSaving, setFormSaving] = useState(false);

  // Edit state
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editType, setEditType] = useState<"charge" | "payment">("charge");
  const [editMethod, setEditMethod] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    description: string;
  } | null>(null);

  const fetchSummary = useCallback(async () => {
    const res = await fetch(
      `/api/admin/financials/summary?trip_id=${tripId}`
    );
    const data = await res.json();
    if (data.trip_totals) setTotals(data.trip_totals);
    if (data.loozers) setLoozers(data.loozers);
  }, [tripId]);

  const fetchLedger = useCallback(async (userId: string) => {
    setLedgerLoading(true);
    const res = await fetch(
      `/api/admin/financials/ledger?user_id=${userId}`
    );
    const data = await res.json();
    setLedger(data.transactions || []);
    setLedgerLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchSummary().finally(() => setLoading(false));
  }, [fetchSummary]);

  // When expanding a card, fetch its ledger
  const toggleExpand = (userId: string) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      setActiveForm(null);
      return;
    }
    setExpandedUserId(userId);
    setActiveForm(null);
    fetchLedger(userId);
  };

  // Filter and sort
  const filtered = loozers
    .filter((l) => {
      const q = search.toLowerCase();
      if (q && !l.display_name.toLowerCase().includes(q) && !(l.full_name || "").toLowerCase().includes(q)) {
        return false;
      }
      if (showOnlyUnpaid && l.trip_balance >= 0) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === "name") return a.display_name.localeCompare(b.display_name);
      if (sort === "balance-desc") return a.trip_balance - b.trip_balance; // most negative first
      return b.trip_balance - a.trip_balance; // least owed first
    });

  const resetForm = () => {
    setActiveForm(null);
    setFormAmount("");
    setFormMethod("Venmo");
    setFormNotes("");
    setFormDescription("");
    setFormChargeType("charge");
  };

  const handleSavePayment = async (userId: string) => {
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) return;
    setFormSaving(true);
    await fetch("/api/admin/financials/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        trip_id: tripId,
        type: "payment",
        description: `Payment via ${formMethod}`,
        amount,
        method: formMethod,
        notes: formNotes || null,
      }),
    });
    setFormSaving(false);
    resetForm();
    await Promise.all([fetchSummary(), fetchLedger(userId)]);
  };

  const handleSaveCharge = async (userId: string) => {
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0 || !formDescription.trim()) return;
    setFormSaving(true);
    await fetch("/api/admin/financials/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        trip_id: tripId,
        type: formChargeType === "charge" ? "charge" : "payment",
        description: formDescription.trim(),
        amount,
      }),
    });
    setFormSaving(false);
    resetForm();
    await Promise.all([fetchSummary(), fetchLedger(userId)]);
  };

  const handleDeleteTransaction = async (txId: string) => {
    const userId = expandedUserId;
    await fetch("/api/admin/financials/transactions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: txId }),
    });
    setDeleteConfirm(null);
    if (userId) {
      await Promise.all([fetchSummary(), fetchLedger(userId)]);
    }
  };

  const startEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setEditDescription(tx.description);
    setEditAmount(String(tx.amount));
    setEditType(tx.type);
    setEditMethod(tx.method || "");
    setEditNotes(tx.notes || "");
  };

  const cancelEdit = () => {
    setEditingTx(null);
  };

  const handleSaveEdit = async () => {
    if (!editingTx) return;
    const amount = parseFloat(editAmount);
    if (!amount || amount <= 0) return;
    if (editingTx.source === "manual" && !editDescription.trim()) return;
    setEditSaving(true);

    const payload: Record<string, unknown> = { id: editingTx.id, amount };
    if (editingTx.source === "manual") {
      payload.type = editType;
      payload.description = editDescription.trim();
      payload.method = editMethod || null;
      payload.notes = editNotes || null;
    }

    await fetch("/api/admin/financials/transactions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setEditSaving(false);
    setEditingTx(null);
    if (expandedUserId) {
      await Promise.all([fetchSummary(), fetchLedger(expandedUserId)]);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {totals && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-green-50 rounded-2xl px-2 py-3 text-center overflow-hidden">
            <div className="text-lg font-bold text-green-700 truncate">
              {fmt(totals.total_charges)}
            </div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
              Charges
            </div>
          </div>
          <div className="bg-blue-50 rounded-2xl px-2 py-3 text-center overflow-hidden">
            <div className="text-lg font-bold text-blue-700 truncate">
              {fmt(totals.total_payments)}
            </div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
              Collected
            </div>
          </div>
          <div className="bg-red-50 rounded-2xl px-2 py-3 text-center overflow-hidden">
            <div className="text-lg font-bold text-red-700 truncate">
              {fmt(totals.total_outstanding)}
            </div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
              Outstanding
            </div>
          </div>
        </div>
      )}

      {/* Filter / Sort Bar */}
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Search Loozers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
        />
        <div className="flex items-center gap-3">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
          >
            <option value="name">Sort by Name</option>
            <option value="balance-desc">Most Owed First</option>
            <option value="balance-asc">Least Owed First</option>
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap">
            <input
              type="checkbox"
              checked={showOnlyUnpaid}
              onChange={(e) => setShowOnlyUnpaid(e.target.checked)}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            Unpaid only
          </label>
        </div>
      </div>

      {/* Loozer Balance List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-6">
            No Loozers match your filters.
          </p>
        )}
        {filtered.map((l) => {
          const isExpanded = expandedUserId === l.user_id;
          const balanceColor =
            l.trip_balance < 0 ? "text-red-600" : "text-green-600";

          return (
            <div
              key={l.user_id}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
            >
              {/* Card Header — always visible */}
              <button
                type="button"
                onClick={() => toggleExpand(l.user_id)}
                className="w-full p-4 text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {l.avatar_url ? (
                      <img
                        src={l.avatar_url}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold text-sm">
                        {l.display_name
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-gray-900">
                        {l.display_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        Charges: {fmt(l.trip_charges)} | Paid:{" "}
                        {fmt(l.trip_payments)}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        Lifetime: {fmt(l.lifetime_balance)}
                      </div>
                    </div>
                  </div>
                  <div className={`text-lg font-bold ${balanceColor}`}>
                    {fmt(l.trip_balance)}
                  </div>
                </div>
              </button>

              {/* Expanded Section */}
              {isExpanded && (
                <div className="border-t border-gray-100">
                  {/* Ledger */}
                  <div className="px-4 py-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Transactions
                    </h4>
                    {ledgerLoading ? (
                      <div className="flex justify-center py-4">
                        <div className="w-6 h-6 border-3 border-green-600 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : ledger.length === 0 ? (
                      <p className="text-sm text-gray-400 py-2">
                        No transactions yet.
                      </p>
                    ) : (
                      <div className="space-y-0 rounded-xl overflow-hidden border border-gray-100">
                        {ledger.map((tx, i) => (
                          <div key={tx.id}>
                            {editingTx?.id === tx.id ? (
                              /* Inline Edit Form */
                              <div className="px-3 py-3 bg-yellow-50 border-y border-yellow-200 space-y-2">
                                {tx.source === "manual" ? (
                                  /* Full edit for manual transactions */
                                  <>
                                    <input
                                      type="text"
                                      value={editDescription}
                                      onChange={(e) => setEditDescription(e.target.value)}
                                      autoFocus
                                      placeholder="Description"
                                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                                    />
                                    <div className="flex gap-2">
                                      <input
                                        type="number"
                                        value={editAmount}
                                        onChange={(e) => setEditAmount(e.target.value)}
                                        placeholder="Amount"
                                        min="0"
                                        step="0.01"
                                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                                      />
                                      <select
                                        value={editType}
                                        onChange={(e) => setEditType(e.target.value as "charge" | "payment")}
                                        className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                                      >
                                        <option value="charge">Charge</option>
                                        <option value="payment">Payment</option>
                                      </select>
                                    </div>
                                    {tx.method != null && (
                                      <select
                                        value={editMethod}
                                        onChange={(e) => setEditMethod(e.target.value)}
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                                      >
                                        <option value="">No method</option>
                                        <option>Cash</option>
                                        <option>G Credit</option>
                                        <option>Venmo</option>
                                        <option>Zelle</option>
                                        <option>Check</option>
                                        <option>Other</option>
                                      </select>
                                    )}
                                    <input
                                      type="text"
                                      value={editNotes}
                                      onChange={(e) => setEditNotes(e.target.value)}
                                      placeholder="Notes (optional)"
                                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                                    />
                                  </>
                                ) : (
                                  /* Amount-only edit for option-derived transactions */
                                  <>
                                    <div className="text-xs text-gray-500">
                                      {tx.description}
                                    </div>
                                    <input
                                      type="number"
                                      value={editAmount}
                                      onChange={(e) => setEditAmount(e.target.value)}
                                      autoFocus
                                      placeholder="Amount"
                                      min="0"
                                      step="0.01"
                                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                                    />
                                  </>
                                )}
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    disabled={editSaving}
                                    onClick={handleSaveEdit}
                                    className="flex-1 py-1.5 bg-green-600 text-white rounded-lg text-sm font-semibold active:opacity-80 disabled:opacity-50"
                                  >
                                    {editSaving ? "Saving..." : "Save"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEdit}
                                    className="flex-1 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-semibold active:bg-gray-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* Normal Row */
                              <div
                                className={`flex items-center justify-between px-3 py-2 text-sm ${
                                  i % 2 === 0 ? "bg-gray-50" : "bg-white"
                                }`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs text-gray-400">
                                      {new Date(tx.created_at).toLocaleDateString()}
                                    </span>
                                    <span
                                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                        tx.type === "charge"
                                          ? "bg-red-100 text-red-700"
                                          : "bg-green-100 text-green-700"
                                      }`}
                                    >
                                      {tx.type}
                                    </span>
                                    <span
                                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                        tx.source === "manual"
                                          ? "bg-gray-100 text-gray-600"
                                          : "bg-blue-100 text-blue-700"
                                      }`}
                                    >
                                      {tx.source}
                                    </span>
                                  </div>
                                  <div className="text-gray-700 truncate">
                                    {tx.description}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 ml-2">
                                  {/* Edit button — all transactions */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEdit(tx);
                                    }}
                                    className="text-gray-400 hover:text-blue-500 p-1"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      className="h-4 w-4"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth={2}
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                      />
                                    </svg>
                                  </button>
                                  {/* Delete button — anything except option/contest_entry (those are managed by their owning systems) */}
                                  {tx.source !== "option" && tx.source !== "contest_entry" && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteConfirm({
                                          id: tx.id,
                                          description: tx.description,
                                        });
                                      }}
                                      className="text-gray-400 hover:text-red-500 p-1"
                                    >
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="h-4 w-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                        />
                                      </svg>
                                    </button>
                                  )}
                                  <span
                                    className={`font-semibold whitespace-nowrap ${
                                      tx.type === "charge"
                                        ? "text-red-600"
                                        : "text-green-600"
                                    }`}
                                  >
                                    {tx.type === "charge" ? "-" : "+"}
                                    {fmt(tx.amount)}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons / Forms */}
                  <div className="px-4 pb-4">
                    {!activeForm && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveForm({
                              userId: l.user_id,
                              kind: "payment",
                            });
                            setFormAmount("");
                            setFormMethod("Venmo");
                            setFormNotes("");
                          }}
                          className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold active:opacity-80"
                        >
                          Record Payment
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveForm({
                              userId: l.user_id,
                              kind: "charge",
                            });
                            setFormAmount("");
                            setFormDescription("");
                            setFormChargeType("charge");
                          }}
                          className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold active:bg-gray-50"
                        >
                          Add Charge/Credit
                        </button>
                      </div>
                    )}

                    {/* Record Payment Form */}
                    {activeForm?.userId === l.user_id &&
                      activeForm.kind === "payment" && (
                        <div className="space-y-3 mt-2 p-3 bg-gray-50 rounded-xl">
                          <h5 className="text-sm font-semibold text-gray-700">
                            Record Payment
                          </h5>
                          <input
                            type="number"
                            placeholder="Amount"
                            value={formAmount}
                            onChange={(e) => setFormAmount(e.target.value)}
                            autoFocus
                            min="0"
                            step="0.01"
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                          />
                          <select
                            value={formMethod}
                            onChange={(e) => setFormMethod(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                          >
                            <option>Cash</option>
                            <option>G Credit</option>
                            <option>Venmo</option>
                            <option>Zelle</option>
                            <option>Check</option>
                            <option>Other</option>
                          </select>
                          <input
                            type="text"
                            placeholder="Notes (optional)"
                            value={formNotes}
                            onChange={(e) => setFormNotes(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={formSaving}
                              onClick={() => handleSavePayment(l.user_id)}
                              className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold active:opacity-80 disabled:opacity-50"
                            >
                              {formSaving ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={resetForm}
                              className="flex-1 py-2 border border-gray-300 text-gray-600 rounded-xl text-sm font-semibold active:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                    {/* Add Charge/Credit Form */}
                    {activeForm?.userId === l.user_id &&
                      activeForm.kind === "charge" && (
                        <div className="space-y-3 mt-2 p-3 bg-gray-50 rounded-xl">
                          <h5 className="text-sm font-semibold text-gray-700">
                            Add Charge/Credit
                          </h5>
                          <input
                            type="text"
                            placeholder="Description"
                            value={formDescription}
                            onChange={(e) =>
                              setFormDescription(e.target.value)
                            }
                            autoFocus
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                          />
                          <input
                            type="number"
                            placeholder="Amount"
                            value={formAmount}
                            onChange={(e) => setFormAmount(e.target.value)}
                            min="0"
                            step="0.01"
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                          />
                          <div className="flex gap-3">
                            <label className="flex items-center gap-1.5 text-sm text-gray-700">
                              <input
                                type="radio"
                                name="chargeType"
                                checked={formChargeType === "charge"}
                                onChange={() => setFormChargeType("charge")}
                                className="text-green-600 focus:ring-green-500"
                              />
                              Charge (they owe more)
                            </label>
                            <label className="flex items-center gap-1.5 text-sm text-gray-700">
                              <input
                                type="radio"
                                name="chargeType"
                                checked={formChargeType === "credit"}
                                onChange={() => setFormChargeType("credit")}
                                className="text-green-600 focus:ring-green-500"
                              />
                              Credit (they owe less)
                            </label>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={formSaving}
                              onClick={() => handleSaveCharge(l.user_id)}
                              className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold active:opacity-80 disabled:opacity-50"
                            >
                              {formSaving ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={resetForm}
                              className="flex-1 py-2 border border-gray-300 text-gray-600 rounded-xl text-sm font-semibold active:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!deleteConfirm}
        title="Delete Transaction"
        message={`Are you sure you want to delete "${deleteConfirm?.description || ""}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteConfirm) handleDeleteTransaction(deleteConfirm.id);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
