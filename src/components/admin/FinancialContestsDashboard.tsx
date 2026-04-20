"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ConfirmModal } from "./ConfirmModal";

// ── Types ──────────────────────────────────────────────────────────────

interface Contest {
  id: string;
  name: string;
  description: string | null;
  contest_date: string | null;
  entry_fee: number;
  participant_count: number;
  created_at: string;
}

interface Participant {
  id: string;
  user_id: string;
  quantity: number;
  user: {
    id: string;
    display_name: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface Trip {
  id: string;
  trip_name: string;
  trip_year: number;
}

interface BalanceUser {
  user_id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  total_charges: number;
  total_payments: number;
  balance: number;
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
  trip_name: string | null;
  contest_name: string | null;
  financial_contest_id: string | null;
  created_by_name: string | null;
  attributed_to: string | null;
  has_history: boolean;
}

type SortOption = "name" | "balance-desc" | "balance-asc";

// ── Helpers ────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

const SOURCE_LABELS: Record<string, { label: string; className: string }> = {
  deposit:       { label: "deposit",     className: "bg-emerald-100 text-emerald-700" },
  withdrawal:    { label: "withdrawal",  className: "bg-rose-100 text-rose-700" },
  winnings:      { label: "winnings",    className: "bg-violet-100 text-violet-700" },
  credit:        { label: "credit",      className: "bg-sky-100 text-sky-700" },
  expense:       { label: "expense",     className: "bg-orange-100 text-orange-700" },
  contest_entry: { label: "entry fee",   className: "bg-indigo-100 text-indigo-700" },
  option:        { label: "option",      className: "bg-teal-100 text-teal-700" },
  adjustment:    { label: "adjustment",  className: "bg-amber-100 text-amber-700" },
  manual:        { label: "manual",      className: "bg-gray-100 text-gray-600" },
};

function SourceChip({ source }: { source: string }) {
  const config = SOURCE_LABELS[source] ?? { label: source, className: "bg-gray-100 text-gray-600" };
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function VersionCard({
  amount,
  type,
  source,
  description,
  method,
  notes,
  author,
  timestamp,
  variant,
}: {
  amount: number;
  type: "charge" | "payment";
  source: string;
  description: string | null;
  method: string | null;
  notes: string | null;
  author: string | null;
  timestamp: string;
  variant: "current" | "edited" | "deleted" | "original";
}) {
  const containerClass =
    variant === "current"
      ? "bg-green-50 border border-green-200"
      : variant === "deleted"
        ? "bg-red-50 border border-red-100"
        : "bg-gray-50 border border-gray-100";
  const actionChip =
    variant === "current"
      ? { label: "Current", className: "bg-green-100 text-green-700" }
      : variant === "deleted"
        ? { label: "Deleted", className: "bg-red-100 text-red-700" }
        : variant === "original"
          ? { label: "Original", className: "bg-blue-100 text-blue-700" }
          : { label: "Edited", className: "bg-amber-100 text-amber-700" };
  const signColor = type === "charge" ? "text-red-600" : "text-green-600";
  return (
    <div className={`rounded-xl p-3 ${containerClass}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 text-xs text-gray-600 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${actionChip.className}`}
            >
              {actionChip.label}
            </span>
            <SourceChip source={source} />
          </div>
          {description && (
            <div className="truncate">
              <span className="text-gray-400">Desc: </span>
              {description}
            </div>
          )}
          {method && (
            <div>
              <span className="text-gray-400">Method: </span>
              {method}
            </div>
          )}
          {notes && (
            <div>
              <span className="text-gray-400">Notes: </span>
              {notes}
            </div>
          )}
          <div className="text-[11px] text-gray-400 whitespace-nowrap pt-0.5">
            {new Date(timestamp).toLocaleString()}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div
            className={`text-2xl font-bold tabular-nums leading-none ${signColor}`}
          >
            {type === "charge" ? "-" : "+"}
            {fmt(amount)}
          </div>
          {author && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
              {author}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ChargeTypePill({
  label,
  sublabel,
  selected,
  selectedClass,
  onClick,
}: {
  label: string;
  sublabel: string;
  selected: boolean;
  selectedClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`px-3 py-2 rounded-xl border text-center active:opacity-80 transition-colors ${
        selected
          ? selectedClass
          : "bg-white border-gray-300 text-gray-700 hover:border-gray-400"
      }`}
    >
      <div className="text-sm font-semibold leading-tight">{label}</div>
      <div
        className={`text-[11px] leading-tight ${
          selected ? "text-white/80" : "text-gray-500"
        }`}
      >
        {sublabel}
      </div>
    </button>
  );
}

function ResponsibleChip({ name }: { name?: string | null }) {
  if (!name) return null;
  return (
    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
      {name}
    </span>
  );
}

function ImpactRow({
  label,
  count,
  total,
  warn = false,
}: {
  label: string;
  count: number;
  total?: number;
  warn?: boolean;
}) {
  const muted = count === 0;
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className={muted ? "text-gray-400" : "text-gray-700"}>{label}</span>
      <span
        className={`tabular-nums font-medium ${
          muted
            ? "text-gray-400"
            : warn
              ? "text-amber-700"
              : "text-gray-900"
        }`}
      >
        {count}
        {total !== undefined && count > 0 ? ` · ${fmt(total)}` : ""}
      </span>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────

export function FinancialContestsDashboard() {
  // Data state
  const [contests, setContests] = useState<Contest[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [users, setUsers] = useState<BalanceUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter/sort
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("name");
  const [showOnlyWithBalance, setShowOnlyWithBalance] = useState(false);

  // Expanded card + ledger
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [ledger, setLedger] = useState<Transaction[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Full ledger modal
  const [fullLedgerModal, setFullLedgerModal] = useState<{
    userId: string;
    userName: string;
  } | null>(null);
  const [fullLedger, setFullLedger] = useState<Transaction[]>([]);
  const [fullLedgerLoading, setFullLedgerLoading] = useState(false);
  const [ledgerDateFrom, setLedgerDateFrom] = useState("");
  const [ledgerDateTo, setLedgerDateTo] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerSortDir, setLedgerSortDir] = useState<"asc" | "desc">("desc");

  // Transaction history modal
  interface HistoryEntry {
    id: string;
    action: string;
    changed_at: string;
    changed_by_name: string | null;
    previous_type: string | null;
    previous_source: string | null;
    previous_description: string | null;
    previous_amount: number | null;
    previous_method: string | null;
    previous_notes: string | null;
  }
  const [txHistoryModal, setTxHistoryModal] = useState<{
    transaction: Transaction;
  } | null>(null);
  const [txHistory, setTxHistory] = useState<HistoryEntry[]>([]);
  const [txHistoryLoading, setTxHistoryLoading] = useState(false);

  // Transaction forms
  const [activeForm, setActiveForm] = useState<{
    userId: string;
    kind: "payment" | "charge" | "withdrawal";
  } | null>(null);
  const [formAmount, setFormAmount] = useState("");
  const [formMethod, setFormMethod] = useState("Venmo");
  const [formNotes, setFormNotes] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formChargeType, setFormChargeType] = useState<"charge" | "credit" | "winnings">("charge");
  const chargeAmountRef = useRef<HTMLInputElement | null>(null);
  const [formAttribution, setFormAttribution] = useState(""); // "contest:id" or "trip:id" or ""
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

  // Contests drawer
  const [showContestsDrawer, setShowContestsDrawer] = useState(false);
  const [contestFormMode, setContestFormMode] = useState<"create" | "edit" | null>(null);
  const [editingContest, setEditingContest] = useState<Contest | null>(null);
  const [contestName, setContestName] = useState("");
  const [contestDescription, setContestDescription] = useState("");
  const [contestDate, setContestDate] = useState("");
  const [contestEntryFee, setContestEntryFee] = useState("");
  const [contestSaving, setContestSaving] = useState(false);
  const [deleteContestConfirm, setDeleteContestConfirm] = useState<Contest | null>(null);
  const [deleteContestImpact, setDeleteContestImpact] = useState<{
    participant_count: number;
    entry_charges: { count: number; total: number };
    orphan_by_source: Record<string, { count: number; total: number }>;
    orphan_other: { count: number; total: number };
  } | null>(null);

  // Participant management
  const [expandedContestId, setExpandedContestId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Record<string, number>>({}); // userId -> quantity
  const [addingParticipants, setAddingParticipants] = useState(false);

  // ── Data Fetching ──────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/financials/balances");
    const data = await res.json();
    if (data.contests) setContests(data.contests);
    if (data.trips) setTrips(data.trips);
    if (data.users) setUsers(data.users);
  }, []);

  const cutoffDate = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 13);
    return d.toISOString();
  })();

  const fetchLedger = useCallback(async (userId: string) => {
    setLedgerLoading(true);
    const res = await fetch(`/api/admin/financials/ledger?user_id=${userId}`);
    const data = await res.json();
    setLedger(data.transactions || []);
    setLedgerLoading(false);
  }, []);

  const openFullLedger = useCallback(
    async (userId: string, userName: string) => {
      const d = new Date();
      d.setMonth(d.getMonth() - 13);
      setLedgerDateFrom(d.toISOString().slice(0, 10));
      setLedgerDateTo(new Date().toISOString().slice(0, 10));
      setLedgerSearch("");
      setLedgerSortDir("desc");
      setFullLedgerModal({ userId, userName });
      setFullLedgerLoading(true);
      const res = await fetch(
        `/api/admin/financials/ledger?user_id=${userId}`
      );
      const data = await res.json();
      setFullLedger(data.transactions || []);
      setFullLedgerLoading(false);
    },
    []
  );

  const openTxHistory = useCallback(async (tx: Transaction) => {
    setTxHistoryModal({ transaction: tx });
    setTxHistoryLoading(true);
    const res = await fetch(
      `/api/admin/financials/transaction-history?transaction_id=${tx.id}`
    );
    const data = await res.json();
    setTxHistory(data.history || []);
    setTxHistoryLoading(false);
  }, []);

  const fetchParticipants = useCallback(async (contestId: string) => {
    setParticipantsLoading(true);
    const res = await fetch(
      `/api/admin/financials/contest-participants?financial_contest_id=${contestId}`
    );
    const data = await res.json();
    setParticipants(data.participants || []);
    setParticipantsLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  // ── Expand/Collapse ────────────────────────────────────────────────

  const toggleExpand = (userId: string) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      setActiveForm(null);
      return;
    }
    setExpandedUserId(userId);
    setActiveForm(null);
    setEditingTx(null);
    fetchLedger(userId);
  };

  // ── Helpers ─────────────────────────────────────────────────────────

  const parseAttribution = (val: string) => {
    if (val.startsWith("contest:")) return { financial_contest_id: val.slice(8), trip_id: null };
    if (val.startsWith("trip:")) return { financial_contest_id: null, trip_id: val.slice(5) };
    return { financial_contest_id: null, trip_id: null };
  };

  // ── Transaction Handlers ───────────────────────────────────────────

  const resetForm = () => {
    setActiveForm(null);
    setFormAmount("");
    setFormMethod("Venmo");
    setFormNotes("");
    setFormDescription("");
    setFormChargeType("charge");
    setFormAttribution("");
  };

  const handleSavePayment = async (userId: string) => {
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) return;
    setFormSaving(true);
    const attr = parseAttribution(formAttribution);
    await fetch("/api/admin/financials/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        ...attr,
        type: "payment",
        source: "deposit",
        description: `Deposit via ${formMethod}`,
        amount,
        method: formMethod,
        notes: formNotes || null,
      }),
    });
    setFormSaving(false);
    resetForm();
    await Promise.all([fetchData(), fetchLedger(userId)]);
  };

  const handleSaveCharge = async (userId: string) => {
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0 || !formDescription.trim()) return;
    const attr = parseAttribution(formAttribution);
    if (formChargeType === "winnings" && !attr.financial_contest_id) return;
    const sourceMap = {
      charge: "expense",
      credit: "credit",
      winnings: "winnings",
    } as const;
    setFormSaving(true);
    await fetch("/api/admin/financials/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        ...attr,
        type: formChargeType === "charge" ? "charge" : "payment",
        source: sourceMap[formChargeType],
        description: formDescription.trim(),
        amount,
      }),
    });
    setFormSaving(false);
    resetForm();
    await Promise.all([fetchData(), fetchLedger(userId)]);
  };

  const handleSaveWithdrawal = async (userId: string) => {
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) return;
    setFormSaving(true);
    await fetch("/api/admin/financials/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        type: "charge",
        source: "withdrawal",
        description: `Withdrawal via ${formMethod}`,
        amount,
        method: formMethod,
        notes: formNotes || null,
      }),
    });
    setFormSaving(false);
    resetForm();
    await Promise.all([fetchData(), fetchLedger(userId)]);
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
      await Promise.all([fetchData(), fetchLedger(userId)]);
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

  const cancelEdit = () => setEditingTx(null);

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
      await Promise.all([fetchData(), fetchLedger(expandedUserId)]);
    }
  };

  // ── Contest CRUD Handlers ──────────────────────────────────────────

  const resetContestForm = () => {
    setContestFormMode(null);
    setEditingContest(null);
    setContestName("");
    setContestDescription("");
    setContestDate("");
    setContestEntryFee("");
  };

  const handleCreateContest = async () => {
    if (!contestName.trim()) return;
    setContestSaving(true);
    await fetch("/api/admin/financials/contests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: contestName.trim(),
        description: contestDescription.trim() || null,
        contest_date: contestDate || null,
        entry_fee: contestEntryFee ? parseFloat(contestEntryFee) : 0,
      }),
    });
    setContestSaving(false);
    resetContestForm();
    await fetchData();
  };

  const handleUpdateContest = async () => {
    if (!editingContest || !contestName.trim()) return;
    setContestSaving(true);
    await fetch("/api/admin/financials/contests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingContest.id,
        name: contestName.trim(),
        description: contestDescription.trim() || null,
        contest_date: contestDate || null,
        entry_fee: contestEntryFee ? parseFloat(contestEntryFee) : 0,
      }),
    });
    setContestSaving(false);
    resetContestForm();
    await fetchData();
  };

  const handleDeleteContest = async (id: string) => {
    await fetch("/api/admin/financials/contests", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setDeleteContestConfirm(null);
    setDeleteContestImpact(null);
    await fetchData();
  };

  const startEditContest = (c: Contest) => {
    setContestFormMode("edit");
    setEditingContest(c);
    setContestName(c.name);
    setContestDescription(c.description || "");
    setContestDate(c.contest_date || "");
    setContestEntryFee(c.entry_fee > 0 ? String(c.entry_fee) : "");
  };

  // ── Participant Handlers ───────────────────────────────────────────

  const toggleContestParticipants = (contestId: string) => {
    if (expandedContestId === contestId) {
      setExpandedContestId(null);
      setShowAddParticipant(false);
      return;
    }
    setExpandedContestId(contestId);
    setShowAddParticipant(false);
    setSelectedUsers({});
    fetchParticipants(contestId);
  };

  const handleAddParticipants = async (contestId: string) => {
    const entries = Object.entries(selectedUsers);
    if (entries.length === 0) return;
    setAddingParticipants(true);

    // Group users by quantity so we can batch where possible
    const byQty = new Map<number, string[]>();
    for (const [uid, qty] of entries) {
      const list = byQty.get(qty) || [];
      list.push(uid);
      byQty.set(qty, list);
    }

    await Promise.all(
      Array.from(byQty.entries()).map(([qty, uids]) =>
        fetch("/api/admin/financials/contest-participants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            financial_contest_id: contestId,
            user_ids: uids,
            quantity: qty,
          }),
        })
      )
    );

    setAddingParticipants(false);
    setShowAddParticipant(false);
    setSelectedUsers({});
    await Promise.all([fetchParticipants(contestId), fetchData()]);
  };

  const handleUpdateQuantity = async (
    contestId: string,
    userId: string,
    quantity: number
  ) => {
    if (quantity < 1) return;
    // Optimistic update
    setParticipants((prev) =>
      prev.map((p) =>
        p.user_id === userId ? { ...p, quantity } : p
      )
    );
    await fetch("/api/admin/financials/contest-participants", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        financial_contest_id: contestId,
        user_id: userId,
        quantity,
      }),
    });
    await fetchData();
  };

  const handleRemoveParticipant = async (
    contestId: string,
    userId: string
  ) => {
    await fetch("/api/admin/financials/contest-participants", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        financial_contest_id: contestId,
        user_id: userId,
      }),
    });
    await Promise.all([fetchParticipants(contestId), fetchData()]);
  };

  // ── Filter & Sort ──────────────────────────────────────────────────

  const filtered = users
    .filter((u) => {
      const q = search.toLowerCase();
      if (
        q &&
        !u.display_name.toLowerCase().includes(q) &&
        !(u.full_name || "").toLowerCase().includes(q)
      ) {
        return false;
      }
      if (showOnlyWithBalance && u.balance === 0) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === "name") return a.display_name.localeCompare(b.display_name);
      if (sort === "balance-desc") return a.balance - b.balance;
      return b.balance - a.balance;
    });

  // Filtered full ledger (memoized for reactivity)
  const filteredFullLedger = useMemo(() => {
    const fromDate = ledgerDateFrom ? ledgerDateFrom + "T00:00:00.000Z" : "";
    const toDate = ledgerDateTo ? ledgerDateTo + "T23:59:59.999Z" : "";
    const q = ledgerSearch.toLowerCase();

    return fullLedger
      .filter((tx) => {
        if (fromDate && tx.created_at < fromDate) return false;
        if (toDate && tx.created_at > toDate) return false;
        if (q && !tx.description.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) =>
        ledgerSortDir === "desc"
          ? b.created_at.localeCompare(a.created_at)
          : a.created_at.localeCompare(b.created_at)
      );
  }, [fullLedger, ledgerDateFrom, ledgerDateTo, ledgerSearch, ledgerSortDir]);

  // ── Render ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Manage Contests Link */}
      <button
        type="button"
        onClick={() => setShowContestsDrawer(true)}
        className="flex items-center gap-1.5 text-green-700 text-sm font-medium active:opacity-70"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        Manage Contests ({contests.length})
      </button>

      {/* Summary Cards */}
      {(() => {
        const totalCharges = users.reduce((s, u) => s + u.total_charges, 0);
        const totalPayments = users.reduce((s, u) => s + u.total_payments, 0);
        const totalOutstanding = users.reduce(
          (s, u) => s + Math.abs(Math.min(u.balance, 0)),
          0
        );
        return (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-green-50 rounded-2xl px-2 py-3 text-center overflow-hidden">
              <div className="text-lg font-bold text-green-700 truncate">
                {fmt(totalCharges)}
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                Charges
              </div>
            </div>
            <div className="bg-blue-50 rounded-2xl px-2 py-3 text-center overflow-hidden">
              <div className="text-lg font-bold text-blue-700 truncate">
                {fmt(totalPayments)}
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                Collected
              </div>
            </div>
            <div className="bg-red-50 rounded-2xl px-2 py-3 text-center overflow-hidden">
              <div className="text-lg font-bold text-red-700 truncate">
                {fmt(totalOutstanding)}
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                Outstanding
              </div>
            </div>
          </div>
        );
      })()}

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
              checked={showOnlyWithBalance}
              onChange={(e) => setShowOnlyWithBalance(e.target.checked)}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            Has balance
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
        {filtered.map((u) => {
          const isExpanded = expandedUserId === u.user_id;
          const bColor =
            u.balance < 0 ? "text-red-600" : u.balance > 0 ? "text-green-600" : "text-gray-400";

          return (
            <div
              key={u.user_id}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
            >
              {/* Card Header */}
              <button
                type="button"
                onClick={() => toggleExpand(u.user_id)}
                className="w-full p-4 text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {u.avatar_url ? (
                      <img
                        src={u.avatar_url}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold text-sm">
                        {u.display_name
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-gray-900">
                        {u.display_name}
                      </div>
                    </div>
                  </div>
                  <div className={`text-lg font-bold ${bColor}`}>
                    {fmt(u.balance)}
                  </div>
                </div>
              </button>

              {/* Expanded Section */}
              {isExpanded && (
                <div className="border-t border-gray-100">
                  {/* Ledger */}
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Recent Transactions
                      </h4>
                      {ledger.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            openFullLedger(u.user_id, u.display_name)
                          }
                          className="text-xs text-green-700 font-medium active:opacity-70"
                        >
                          View full history
                        </button>
                      )}
                    </div>
                    {ledgerLoading ? (
                      <div className="flex justify-center py-4">
                        <div className="w-6 h-6 border-3 border-green-600 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : ledger.filter((tx) => tx.created_at >= cutoffDate).length === 0 ? (
                      <div>
                        <p className="text-sm text-gray-400 py-2">
                          No recent transactions.
                        </p>
                        {ledger.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              openFullLedger(u.user_id, u.display_name)
                            }
                            className="text-xs text-green-700 font-medium active:opacity-70"
                          >
                            View older transactions
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-100">
                        <div className="space-y-0">
                        {ledger.filter((tx) => tx.created_at >= cutoffDate).map((tx, i) => (
                          <div key={tx.id}>
                            {editingTx?.id === tx.id ? (
                              /* Inline Edit Form */
                              <div className="px-3 py-3 bg-yellow-50 border-y border-yellow-200 space-y-2">
                                {tx.source === "manual" ? (
                                  <>
                                    <input
                                      type="text"
                                      value={editDescription}
                                      onChange={(e) =>
                                        setEditDescription(e.target.value)
                                      }
                                      autoFocus
                                      placeholder="Description"
                                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                                    />
                                    <div className="flex gap-2">
                                      <input
                                        type="number"
                                        value={editAmount}
                                        onChange={(e) =>
                                          setEditAmount(e.target.value)
                                        }
                                        placeholder="Amount"
                                        min="0"
                                        step="0.01"
                                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                                      />
                                      <select
                                        value={editType}
                                        onChange={(e) =>
                                          setEditType(
                                            e.target.value as
                                              | "charge"
                                              | "payment"
                                          )
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
                                        onChange={(e) =>
                                          setEditMethod(e.target.value)
                                        }
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
                                      onChange={(e) =>
                                        setEditNotes(e.target.value)
                                      }
                                      placeholder="Notes (optional)"
                                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                                    />
                                  </>
                                ) : (
                                  <>
                                    <div className="text-xs text-gray-500">
                                      {tx.description}
                                    </div>
                                    <input
                                      type="number"
                                      value={editAmount}
                                      onChange={(e) =>
                                        setEditAmount(e.target.value)
                                      }
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
                                      {new Date(
                                        tx.created_at
                                      ).toLocaleDateString()}
                                    </span>
                                    <SourceChip source={tx.source} />
                                    <ResponsibleChip name={tx.attributed_to} />
                                    {tx.has_history && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openTxHistory(tx);
                                        }}
                                        className="inline-flex p-0 text-amber-500 hover:text-amber-700 ml-0.5"
                                      >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                      </button>
                                    )}
                                    {tx.contest_name && (
                                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
                                        {tx.contest_name}
                                      </span>
                                    )}
                                    {tx.trip_name && (
                                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                                        {tx.trip_name}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-gray-700 truncate">
                                    {tx.description}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 ml-2">
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
                                  {tx.source === "manual" && (
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
                              userId: u.user_id,
                              kind: "payment",
                            });
                            setFormAmount("");
                            setFormMethod("Venmo");
                            setFormNotes("");
                            setFormAttribution("");
                          }}
                          className="flex-1 py-2 bg-green-600 text-white rounded-xl text-xs font-semibold active:opacity-80 flex items-center justify-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0-16l-4 4m4-4l4 4" />
                          </svg>
                          Deposit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveForm({
                              userId: u.user_id,
                              kind: "charge",
                            });
                            setFormAmount("");
                            setFormDescription("");
                            setFormChargeType("charge");
                            setFormAttribution("");
                          }}
                          className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-xl text-xs font-semibold active:bg-gray-50 flex items-center justify-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Charge
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveForm({
                              userId: u.user_id,
                              kind: "withdrawal",
                            });
                            setFormAmount("");
                            setFormMethod("Venmo");
                            setFormNotes("");
                            setFormAttribution("");
                          }}
                          className="flex-1 py-2 border border-red-300 text-red-700 rounded-xl text-xs font-semibold active:bg-red-50 flex items-center justify-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20V4m0 16l-4-4m4 4l4-4" />
                          </svg>
                          Withdraw
                        </button>
                      </div>
                    )}

                    {/* Record Payment Form */}
                    {activeForm?.userId === u.user_id &&
                      activeForm.kind === "payment" && (
                        <div className="space-y-3 mt-2 p-3 bg-gray-50 rounded-xl">
                          <h5 className="text-sm font-semibold text-gray-700">
                            Deposit
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
                          {(contests.length > 0 || trips.length > 0) && (
                            <select
                              value={formAttribution}
                              onChange={(e) =>
                                setFormAttribution(e.target.value)
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                            >
                              <option value="">No event</option>
                              {trips.length > 0 && (
                                <optgroup label="Golfapalooza">
                                  {trips.map((t) => (
                                    <option key={t.id} value={`trip:${t.id}`}>
                                      {t.trip_name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {contests.length > 0 && (
                                <optgroup label="Contests">
                                  {contests.map((c) => (
                                    <option key={c.id} value={`contest:${c.id}`}>
                                      {c.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          )}
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
                              onClick={() => handleSavePayment(u.user_id)}
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
                    {activeForm?.userId === u.user_id &&
                      activeForm.kind === "charge" && (
                        <div className="space-y-3 mt-2 p-3 bg-gray-50 rounded-xl">
                          <h5 className="text-sm font-semibold text-gray-700">
                            Charge / Credit / Winnings
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
                            ref={chargeAmountRef}
                            type="number"
                            placeholder="Amount"
                            value={formAmount}
                            onChange={(e) => setFormAmount(e.target.value)}
                            min="0"
                            step="0.01"
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                          />
                          {(contests.length > 0 || trips.length > 0) && (
                            <select
                              value={formAttribution}
                              onChange={(e) =>
                                setFormAttribution(e.target.value)
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                            >
                              <option value="">
                                {formChargeType === "winnings"
                                  ? "Select a contest…"
                                  : "No event"}
                              </option>
                              {trips.length > 0 && formChargeType !== "winnings" && (
                                <optgroup label="Golfapalooza">
                                  {trips.map((t) => (
                                    <option key={t.id} value={`trip:${t.id}`}>
                                      {t.trip_name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {contests.length > 0 && (
                                <optgroup label="Contests">
                                  {contests.map((c) => (
                                    <option key={c.id} value={`contest:${c.id}`}>
                                      {c.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          )}
                          <div className="grid grid-cols-3 gap-2">
                            <ChargeTypePill
                              label="Charge"
                              sublabel="they owe more"
                              selected={formChargeType === "charge"}
                              selectedClass="bg-orange-600 text-white border-orange-600"
                              onClick={() => setFormChargeType("charge")}
                            />
                            <ChargeTypePill
                              label="Credit"
                              sublabel="they owe less"
                              selected={formChargeType === "credit"}
                              selectedClass="bg-sky-600 text-white border-sky-600"
                              onClick={() => setFormChargeType("credit")}
                            />
                            <ChargeTypePill
                              label="Winnings"
                              sublabel="contest payout"
                              selected={formChargeType === "winnings"}
                              selectedClass="bg-violet-600 text-white border-violet-600"
                              onClick={() => {
                                setFormChargeType("winnings");
                                setFormDescription("Winnings");
                                if (!formAttribution.startsWith("contest:")) {
                                  setFormAttribution("");
                                }
                                chargeAmountRef.current?.focus();
                              }}
                            />
                          </div>
                          {formChargeType === "winnings" &&
                            !formAttribution.startsWith("contest:") && (
                              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                Pick the contest this payout came from.
                              </p>
                            )}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={
                                formSaving ||
                                (formChargeType === "winnings" &&
                                  !formAttribution.startsWith("contest:"))
                              }
                              onClick={() => handleSaveCharge(u.user_id)}
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

                    {/* Withdrawal Form */}
                    {activeForm?.userId === u.user_id &&
                      activeForm.kind === "withdrawal" && (
                        <div className="space-y-3 mt-2 p-3 bg-red-50 rounded-xl">
                          <h5 className="text-sm font-semibold text-red-700">
                            Record Withdrawal
                          </h5>
                          <input
                            type="number"
                            placeholder="Amount"
                            value={formAmount}
                            onChange={(e) => setFormAmount(e.target.value)}
                            autoFocus
                            min="0"
                            step="0.01"
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
                          />
                          <select
                            value={formMethod}
                            onChange={(e) => setFormMethod(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={formSaving}
                              onClick={() => handleSaveWithdrawal(u.user_id)}
                              className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold active:opacity-80 disabled:opacity-50"
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

      {/* ── Contests Drawer ─────────────────────────────────────────── */}
      {showContestsDrawer && (
        <div className="fixed top-14 bottom-16 left-0 right-0 z-35 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setShowContestsDrawer(false);
              resetContestForm();
            }}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  Manage Contests
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowContestsDrawer(false);
                    resetContestForm();
                  }}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
              {/* Add Contest Button */}
              {!contestFormMode && (
                <button
                  type="button"
                  onClick={() => setContestFormMode("create")}
                  className="w-full py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold active:opacity-80"
                >
                  + Add Contest
                </button>
              )}

              {/* Create/Edit Form */}
              {contestFormMode && (
                <div
                  className={`border rounded-2xl p-4 space-y-3 ${
                    contestFormMode === "edit"
                      ? "bg-yellow-50 border-yellow-200"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <h4 className="text-sm font-semibold text-gray-700">
                    {contestFormMode === "create"
                      ? "New Contest"
                      : "Edit Contest"}
                  </h4>
                  <input
                    type="text"
                    placeholder="Contest name"
                    value={contestName}
                    onChange={(e) => setContestName(e.target.value)}
                    autoFocus
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={contestDescription}
                    onChange={(e) => setContestDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                  />
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      Contest Date (optional)
                    </label>
                    <input
                      type="date"
                      value={contestDate}
                      onChange={(e) => setContestDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      Entry Fee
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      value={contestEntryFee}
                      onChange={(e) => setContestEntryFee(e.target.value)}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={contestSaving || !contestName.trim()}
                      onClick={
                        contestFormMode === "create"
                          ? handleCreateContest
                          : handleUpdateContest
                      }
                      className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold active:opacity-80 disabled:opacity-50"
                    >
                      {contestSaving
                        ? "Saving..."
                        : contestFormMode === "create"
                          ? "Create"
                          : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={resetContestForm}
                      className="flex-1 py-2 border border-gray-300 text-gray-600 rounded-xl text-sm font-semibold active:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Contest List */}
              {contests.length === 0 && !contestFormMode ? (
                <p className="text-center text-sm text-gray-400 py-6">
                  No contests yet. Create one to get started.
                </p>
              ) : (
                contests.map((c) => {
                  const isExpContest = expandedContestId === c.id;
                  const participantIds = new Set(
                    participants.map((p) => p.user_id)
                  );
                  const availableUsers = users.filter(
                    (u) => !participantIds.has(u.user_id)
                  );

                  return (
                    <div
                      key={c.id}
                      className="bg-white border border-gray-200 rounded-2xl overflow-hidden"
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900">
                              {c.name}
                            </div>
                            {c.description && (
                              <div className="text-sm text-gray-500 mt-0.5 truncate">
                                {c.description}
                              </div>
                            )}
                            <div className="flex items-center gap-3 mt-1">
                              {c.contest_date && (
                                <span className="text-xs text-gray-400">
                                  {new Date(
                                    c.contest_date + "T00:00:00"
                                  ).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}
                                </span>
                              )}
                              {c.entry_fee > 0 && (
                                <span className="text-xs text-green-600 font-medium">
                                  {fmt(c.entry_fee)} entry
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              type="button"
                              onClick={() => startEditContest(c)}
                              className="text-gray-400 hover:text-blue-500 p-1"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-5 w-5"
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
                            <button
                              type="button"
                              onClick={async () => {
                                setDeleteContestConfirm(c);
                                setDeleteContestImpact(null);
                                const res = await fetch(
                                  `/api/admin/financials/contests/impact?id=${c.id}`
                                );
                                if (res.ok) {
                                  setDeleteContestImpact(await res.json());
                                }
                              }}
                              className="text-gray-400 hover:text-red-500 p-1"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-5 w-5"
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
                          </div>
                        </div>

                        {/* Participants toggle */}
                        <button
                          type="button"
                          onClick={() => toggleContestParticipants(c.id)}
                          className="mt-2 text-xs text-green-700 font-medium flex items-center gap-1 active:opacity-70"
                        >
                          <svg
                            className={`w-3 h-3 transition-transform ${isExpContest ? "rotate-90" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                          {c.participant_count} participant
                          {c.participant_count !== 1 ? "s" : ""}
                        </button>
                      </div>

                      {/* Expanded Participants Section */}
                      {isExpContest && (
                        <div className="border-t border-gray-100 px-4 py-3 space-y-2">
                          {participantsLoading ? (
                            <div className="flex justify-center py-3">
                              <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                            </div>
                          ) : (
                            <>
                              {/* Participant list */}
                              {participants.length === 0 ? (
                                <p className="text-xs text-gray-400">
                                  No participants yet.
                                </p>
                              ) : (
                                <div className="space-y-1.5">
                                  {participants.map((p) => (
                                    <div
                                      key={p.id}
                                      className="flex items-center justify-between py-1"
                                    >
                                      <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">
                                        {p.user.display_name}
                                      </span>
                                      <div className="flex items-center gap-1.5 ml-2">
                                        {/* Quantity stepper */}
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleUpdateQuantity(
                                              c.id,
                                              p.user_id,
                                              p.quantity - 1
                                            )
                                          }
                                          disabled={p.quantity <= 1}
                                          className="w-6 h-6 flex items-center justify-center rounded-full border border-gray-300 text-gray-500 text-xs font-bold disabled:opacity-30 active:bg-gray-100"
                                        >
                                          -
                                        </button>
                                        <span className="text-xs font-semibold text-gray-700 w-5 text-center">
                                          {p.quantity}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleUpdateQuantity(
                                              c.id,
                                              p.user_id,
                                              p.quantity + 1
                                            )
                                          }
                                          className="w-6 h-6 flex items-center justify-center rounded-full border border-gray-300 text-gray-500 text-xs font-bold active:bg-gray-100"
                                        >
                                          +
                                        </button>
                                        {/* Remove */}
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleRemoveParticipant(
                                              c.id,
                                              p.user_id
                                            )
                                          }
                                          className="text-gray-400 hover:text-red-500 p-0.5 ml-1"
                                        >
                                          <svg
                                            className="w-4 h-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M6 18L18 6M6 6l12 12"
                                          />
                                        </svg>
                                      </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Add participants */}
                              {!showAddParticipant ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowAddParticipant(true);
                                    setSelectedUsers({});
                                  }}
                                  className="text-xs text-green-700 font-medium active:opacity-70"
                                >
                                  + Add Participants
                                </button>
                              ) : (
                                <div className="space-y-2 p-2 bg-gray-50 rounded-xl">
                                  {availableUsers.length === 0 ? (
                                    <p className="text-xs text-gray-400">
                                      All Loozers are already participating.
                                    </p>
                                  ) : (
                                    <div className="max-h-48 overflow-y-auto space-y-1">
                                      {availableUsers.map((u) => {
                                        const qty = selectedUsers[u.user_id];
                                        const isSelected = qty !== undefined;
                                        return (
                                          <div
                                            key={u.user_id}
                                            className="flex items-center justify-between py-1"
                                          >
                                            <label className="flex items-center gap-2 text-sm text-gray-700 flex-1 min-w-0">
                                              <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={(e) => {
                                                  if (e.target.checked) {
                                                    setSelectedUsers((prev) => ({
                                                      ...prev,
                                                      [u.user_id]: 1,
                                                    }));
                                                  } else {
                                                    setSelectedUsers((prev) => {
                                                      const next = { ...prev };
                                                      delete next[u.user_id];
                                                      return next;
                                                    });
                                                  }
                                                }}
                                                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                                              />
                                              <span className="truncate">{u.display_name}</span>
                                            </label>
                                            {isSelected && (
                                              <div className="flex items-center gap-1 ml-2">
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setSelectedUsers((prev) => ({
                                                      ...prev,
                                                      [u.user_id]: Math.max(1, (prev[u.user_id] || 1) - 1),
                                                    }))
                                                  }
                                                  disabled={qty <= 1}
                                                  className="w-5 h-5 flex items-center justify-center rounded-full border border-gray-300 text-gray-500 text-[10px] font-bold disabled:opacity-30 active:bg-gray-100"
                                                >
                                                  -
                                                </button>
                                                <span className="text-xs font-semibold text-gray-700 w-4 text-center">
                                                  {qty}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setSelectedUsers((prev) => ({
                                                      ...prev,
                                                      [u.user_id]: (prev[u.user_id] || 1) + 1,
                                                    }))
                                                  }
                                                  className="w-5 h-5 flex items-center justify-center rounded-full border border-gray-300 text-gray-500 text-[10px] font-bold active:bg-gray-100"
                                                >
                                                  +
                                                </button>
                                                {c.entry_fee > 0 && (
                                                  <span className="text-[10px] text-gray-400 ml-1 whitespace-nowrap">
                                                    {fmt(c.entry_fee * qty)}
                                                  </span>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      disabled={
                                        addingParticipants ||
                                        Object.keys(selectedUsers).length === 0
                                      }
                                      onClick={() =>
                                        handleAddParticipants(c.id)
                                      }
                                      className="flex-1 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold active:opacity-80 disabled:opacity-50"
                                    >
                                      {addingParticipants
                                        ? "Adding..."
                                        : `Add ${Object.keys(selectedUsers).length || ""}`}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setShowAddParticipant(false);
                                        setSelectedUsers({});
                                      }}
                                      className="flex-1 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs font-semibold active:bg-gray-50"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full Ledger Modal */}
      {fullLedgerModal && (
        <div className="fixed top-14 bottom-16 left-0 right-0 z-35 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setFullLedgerModal(null)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up max-h-[85vh] flex flex-col">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {fullLedgerModal.userName}
                  </h2>
                  <p className="text-sm text-gray-500">Full Transaction History</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFullLedgerModal(null)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Filters */}
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-500 uppercase">From</label>
                    <input
                      type="date"
                      value={ledgerDateFrom}
                      onChange={(e) => setLedgerDateFrom(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-green-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-500 uppercase">To</label>
                    <input
                      type="date"
                      value={ledgerDateTo}
                      onChange={(e) => setLedgerDateTo(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-green-500 focus:outline-none"
                    />
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Search descriptions..."
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-green-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Scrollable transaction list */}
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {fullLedgerLoading ? (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-3 border-green-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (() => {
                const totalCharges = filteredFullLedger
                  .filter((tx) => tx.type === "charge")
                  .reduce((s, tx) => s + tx.amount, 0);
                const totalPayments = filteredFullLedger
                  .filter((tx) => tx.type === "payment")
                  .reduce((s, tx) => s + tx.amount, 0);
                const netBalance = totalPayments - totalCharges;

                return (
                  <>
                    {/* Summary */}
                    <div className="flex gap-2 mb-3">
                      <div className="flex-1 bg-red-50 rounded-xl px-2 py-1.5 text-center">
                        <div className="text-xs font-bold text-red-700">{fmt(totalCharges)}</div>
                        <div className="text-[9px] text-gray-500 uppercase">Charges</div>
                      </div>
                      <div className="flex-1 bg-green-50 rounded-xl px-2 py-1.5 text-center">
                        <div className="text-xs font-bold text-green-700">{fmt(totalPayments)}</div>
                        <div className="text-[9px] text-gray-500 uppercase">Payments</div>
                      </div>
                      <div className="flex-1 bg-gray-50 rounded-xl px-2 py-1.5 text-center">
                        <div className={`text-xs font-bold ${netBalance < 0 ? "text-red-600" : netBalance > 0 ? "text-green-600" : "text-gray-500"}`}>
                          {fmt(netBalance)}
                        </div>
                        <div className="text-[9px] text-gray-500 uppercase">Balance</div>
                      </div>
                    </div>

                    {/* Sort toggle */}
                    <button
                      type="button"
                      onClick={() => setLedgerSortDir((d) => d === "desc" ? "asc" : "desc")}
                      className="text-[10px] text-gray-500 mb-2 flex items-center gap-1"
                    >
                      Date {ledgerSortDir === "desc" ? "▼ Newest" : "▲ Oldest"} first
                    </button>

                    {filteredFullLedger.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">
                        No transactions match your filters.
                      </p>
                    ) : (
                      <div className="space-y-0 rounded-xl overflow-hidden border border-gray-100">
                        {filteredFullLedger.map((tx, i) => (
                          <div
                            key={tx.id}
                            className={`flex items-center justify-between px-3 py-2 text-sm ${
                              i % 2 === 0 ? "bg-gray-50" : "bg-white"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs text-gray-400">
                                  {new Date(tx.created_at).toLocaleDateString()}
                                </span>
                                <SourceChip source={tx.source} />
                                    <ResponsibleChip name={tx.attributed_to} />
                                {tx.has_history && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openTxHistory(tx);
                                    }}
                                    className="inline-flex p-0 text-amber-500 hover:text-amber-700 ml-0.5"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  </button>
                                )}
                                {tx.contest_name && (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
                                    {tx.contest_name}
                                  </span>
                                )}
                                {tx.trip_name && (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                                    {tx.trip_name}
                                  </span>
                                )}
                              </div>
                              <div className="text-gray-700 truncate">
                                {tx.description}
                              </div>
                            </div>
                            <span
                              className={`font-semibold whitespace-nowrap ml-2 ${
                                tx.type === "charge"
                                  ? "text-red-600"
                                  : "text-green-600"
                              }`}
                            >
                              {tx.type === "charge" ? "-" : "+"}
                              {fmt(tx.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400 text-center mt-2">
                      {filteredFullLedger.length} transaction{filteredFullLedger.length !== 1 ? "s" : ""}
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Transaction History Modal */}
      {txHistoryModal && (
        <div className="fixed top-14 bottom-16 left-0 right-0 z-40 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setTxHistoryModal(null)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up max-h-[60vh] flex flex-col">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
              <h2 className="text-lg font-bold text-gray-900">Edit History</h2>
              <p className="text-sm text-gray-500 truncate">
                {txHistoryModal.transaction.description}
              </p>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {(() => {
                const current = txHistoryModal.transaction;
                // The current state was created either at original creation
                // time (no edits) or at the moment of the most recent edit.
                const currentTimestamp =
                  txHistory[0]?.changed_at ?? current.created_at;
                return (
                  <VersionCard
                    amount={current.amount}
                    type={current.type}
                    source={current.source}
                    description={current.description}
                    method={current.method}
                    notes={current.notes}
                    author={current.attributed_to}
                    timestamp={currentTimestamp}
                    variant="current"
                  />
                );
              })()}
              {txHistoryLoading ? (
                <div className="flex justify-center py-4 mt-3">
                  <div className="w-6 h-6 border-3 border-green-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : txHistory.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-2 mt-3">
                  No prior versions.
                </p>
              ) : (
                <div className="space-y-3 mt-3">
                  {txHistory.map((h, i) => {
                    // The author *and* timestamp of this previous state come
                    // from the edit that produced it — i.e. the next-older
                    // history entry — or the original creation for the oldest.
                    const isOriginal = i === txHistory.length - 1;
                    const author = isOriginal
                      ? txHistoryModal.transaction.created_by_name
                      : txHistory[i + 1].changed_by_name;
                    const timestamp = isOriginal
                      ? txHistoryModal.transaction.created_at
                      : txHistory[i + 1].changed_at;
                    return (
                      <VersionCard
                        key={h.id}
                        amount={h.previous_amount || 0}
                        type={h.previous_type === "charge" ? "charge" : "payment"}
                        source={h.previous_source || "manual"}
                        description={h.previous_description}
                        method={h.previous_method}
                        notes={h.previous_notes}
                        author={author}
                        timestamp={timestamp}
                        variant={
                          h.action === "delete"
                            ? "deleted"
                            : isOriginal
                              ? "original"
                              : "edited"
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Transaction Confirmation */}
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

      {/* Delete Contest Confirmation */}
      <ConfirmModal
        open={!!deleteContestConfirm}
        title="Delete Contest"
        message={
          <div className="space-y-3">
            <p>
              Delete <span className="font-semibold text-gray-900">&ldquo;{deleteContestConfirm?.name || ""}&rdquo;</span>?
            </p>
            {deleteContestImpact === null ? (
              <p className="text-xs text-gray-400">Checking impact…</p>
            ) : (
              (() => {
                const sources = deleteContestImpact.orphan_by_source;
                const orphanRows = [
                  { key: "winnings", label: "Winnings unlinked" },
                  { key: "credit", label: "Credits unlinked" },
                  { key: "expense", label: "Expenses unlinked" },
                  { key: "adjustment", label: "Adjustments unlinked" },
                  { key: "manual", label: "Legacy manual unlinked" },
                ].filter((r) => (sources[r.key]?.count ?? 0) > 0);
                const hasOrphans =
                  orphanRows.length > 0 || deleteContestImpact.orphan_other.count > 0;
                return (
                  <>
                    <div className="rounded-xl bg-gray-50 border border-gray-200 divide-y divide-gray-200 text-[13px]">
                      <ImpactRow
                        label="Participants removed"
                        count={deleteContestImpact.participant_count}
                      />
                      <ImpactRow
                        label="Entry fee charges deleted"
                        count={deleteContestImpact.entry_charges.count}
                        total={deleteContestImpact.entry_charges.total}
                      />
                      {orphanRows.map((r) => (
                        <ImpactRow
                          key={r.key}
                          label={r.label}
                          count={sources[r.key].count}
                          total={sources[r.key].total}
                          warn
                        />
                      ))}
                      {deleteContestImpact.orphan_other.count > 0 && (
                        <ImpactRow
                          label="Other unlinked"
                          count={deleteContestImpact.orphan_other.count}
                          total={deleteContestImpact.orphan_other.total}
                          warn
                        />
                      )}
                      {!hasOrphans && (
                        <div className="px-3 py-2 text-gray-400">
                          No other linked transactions
                        </div>
                      )}
                    </div>
                    {hasOrphans && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Unlinked transactions stay on user balances but lose
                        their connection to this contest and can&rsquo;t be
                        restored.
                      </p>
                    )}
                  </>
                );
              })()
            )}
          </div>
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteContestConfirm)
            handleDeleteContest(deleteContestConfirm.id);
        }}
        onCancel={() => {
          setDeleteContestConfirm(null);
          setDeleteContestImpact(null);
        }}
      />
    </div>
  );
}
