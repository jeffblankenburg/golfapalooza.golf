"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "./ConfirmModal";

interface Transaction {
  id: string;
  type: "charge" | "payment";
  source: string;
  description: string;
  amount: number;
  method: string | null;
  notes: string | null;
  created_at: string;
}

interface ContestCellModalProps {
  open: boolean;
  userId: string;
  contestId: string;
  userName: string;
  contestName: string;
  onClose: () => void;
  onTransactionChange: () => void;
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

export function ContestCellModal({
  open,
  userId,
  contestId,
  userName,
  contestName,
  onClose,
  onTransactionChange,
}: ContestCellModalProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  // Add form state
  const [showForm, setShowForm] = useState<"charge" | "payment" | null>(null);
  const [formAmount, setFormAmount] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formMethod, setFormMethod] = useState("Venmo");
  const [formChargeType, setFormChargeType] = useState<"charge" | "credit">("charge");
  const [formSaving, setFormSaving] = useState(false);

  // Edit state
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editType, setEditType] = useState<"charge" | "payment">("charge");
  const [editMethod, setEditMethod] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    description: string;
  } | null>(null);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/admin/financials/contest-ledger?user_id=${userId}&financial_contest_id=${contestId}`
    );
    const data = await res.json();
    setTransactions(data.transactions || []);
    setLoading(false);
  }, [userId, contestId]);

  useEffect(() => {
    if (open) {
      fetchTransactions();
      setShowForm(null);
      setEditingTx(null);
    }
  }, [open, fetchTransactions]);

  const resetForm = () => {
    setShowForm(null);
    setFormAmount("");
    setFormDescription("");
    setFormMethod("Venmo");
    setFormChargeType("charge");
  };

  const handleSavePayment = async () => {
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) return;
    setFormSaving(true);
    await fetch("/api/admin/financials/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        financial_contest_id: contestId,
        type: "payment",
        description: `Payment via ${formMethod}`,
        amount,
        method: formMethod,
      }),
    });
    setFormSaving(false);
    resetForm();
    await fetchTransactions();
    onTransactionChange();
  };

  const handleSaveCharge = async () => {
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0 || !formDescription.trim()) return;
    setFormSaving(true);
    await fetch("/api/admin/financials/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        financial_contest_id: contestId,
        type: formChargeType === "charge" ? "charge" : "payment",
        description: formDescription.trim(),
        amount,
      }),
    });
    setFormSaving(false);
    resetForm();
    await fetchTransactions();
    onTransactionChange();
  };

  const startEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setEditDescription(tx.description);
    setEditAmount(String(tx.amount));
    setEditType(tx.type);
    setEditMethod(tx.method || "");
    setEditNotes(tx.notes || "");
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
    await fetchTransactions();
    onTransactionChange();
  };

  const handleDelete = async (txId: string) => {
    await fetch("/api/admin/financials/transactions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: txId }),
    });
    setDeleteConfirm(null);
    await fetchTransactions();
    onTransactionChange();
  };

  if (!open) return null;

  return (
    <div className="fixed top-14 bottom-16 left-0 right-0 z-35 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900">{userName}</h2>
          <p className="text-sm text-gray-500">{contestName}</p>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Transactions */}
          {loading ? (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-3 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">
              No transactions yet.
            </p>
          ) : (
            <div className="space-y-0 rounded-xl overflow-hidden border border-gray-100">
              {transactions.map((tx, i) => (
                <div key={tx.id}>
                  {editingTx?.id === tx.id ? (
                    <div className="px-3 py-3 bg-yellow-50 border-y border-yellow-200 space-y-2">
                      {tx.source === "manual" ? (
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
                              onChange={(e) =>
                                setEditType(e.target.value as "charge" | "payment")
                              }
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
                        </>
                      ) : (
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
                          onClick={() => setEditingTx(null)}
                          className="flex-1 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-semibold active:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
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
                        </div>
                        <div className="text-gray-700 truncate">
                          {tx.description}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          type="button"
                          onClick={() => startEdit(tx)}
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
                        {tx.source === "manual" && (
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteConfirm({
                                id: tx.id,
                                description: tx.description,
                              })
                            }
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

          {/* Action Buttons / Forms */}
          {!showForm && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowForm("payment")}
                className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold active:opacity-80"
              >
                Record Payment
              </button>
              <button
                type="button"
                onClick={() => setShowForm("charge")}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold active:bg-gray-50"
              >
                Add Charge/Credit
              </button>
            </div>
          )}

          {/* Payment Form */}
          {showForm === "payment" && (
            <div className="space-y-3 p-3 bg-gray-50 rounded-xl">
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
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={formSaving}
                  onClick={handleSavePayment}
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

          {/* Charge/Credit Form */}
          {showForm === "charge" && (
            <div className="space-y-3 p-3 bg-gray-50 rounded-xl">
              <h5 className="text-sm font-semibold text-gray-700">
                Add Charge/Credit
              </h5>
              <input
                type="text"
                placeholder="Description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
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
                    name="contestChargeType"
                    checked={formChargeType === "charge"}
                    onChange={() => setFormChargeType("charge")}
                    className="text-green-600 focus:ring-green-500"
                  />
                  Charge (they owe)
                </label>
                <label className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="contestChargeType"
                    checked={formChargeType === "credit"}
                    onChange={() => setFormChargeType("credit")}
                    className="text-green-600 focus:ring-green-500"
                  />
                  Credit (they won)
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={formSaving}
                  onClick={handleSaveCharge}
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

      {/* Delete Confirmation */}
      <ConfirmModal
        open={!!deleteConfirm}
        title="Delete Transaction"
        message={`Are you sure you want to delete "${deleteConfirm?.description || ""}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteConfirm) handleDelete(deleteConfirm.id);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
