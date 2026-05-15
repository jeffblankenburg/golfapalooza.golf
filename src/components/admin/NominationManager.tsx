"use client";

import { useState, useEffect } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { DragHandle } from "@/components/DragHandle";

interface Nomination {
  id: string;
  phone: string;
  first_name: string;
  last_name: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  nominator: { display_name: string; avatar_url: string | null } | null;
  reviewer: { display_name: string } | null;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) return phone;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function NominationManager() {
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approveModal, setApproveModal] = useState<{
    nominationId: string;
    name: string;
    phone: string;
  } | null>(null);
  const [inviteMessage, setInviteMessage] = useState("");
  const [rejectModal, setRejectModal] = useState<{
    nominationId: string;
    name: string;
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const fetchNominations = async () => {
    try {
      const res = await fetch("/api/admin/nominations");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load nominations");
        return;
      }
      setNominations(data.nominations);
    } catch {
      setError("Failed to load nominations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNominations();
  }, []);

  const handleApprove = (nom: Nomination) => {
    setInviteMessage(
      `Hey ${nom.first_name}! You've been invited to join Golfapalooza. Get started at https://golfapalooza.app!`
    );
    setApproveModal({
      nominationId: nom.id,
      name: `${nom.first_name} ${nom.last_name}`,
      phone: nom.phone,
    });
  };

  const submitApprove = async () => {
    if (!approveModal) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/admin/nominations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nominationId: approveModal.nominationId,
          action: "approve",
          inviteMessage: inviteMessage.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to approve nomination");
        return;
      }

      // Open the admin's native Messages app with the invite pre-filled.
      // iOS expects `&body=`, Android expects `?body=` — pick the right one.
      if (inviteMessage.trim() && data.phone) {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const sep = isIOS ? "&" : "?";
        const smsUrl = `sms:+1${data.phone}${sep}body=${encodeURIComponent(inviteMessage.trim())}`;
        window.location.href = smsUrl;
      }

      setApproveModal(null);
      fetchNominations();
    } catch {
      setError("Failed to approve nomination");
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = (nom: Nomination) => {
    setRejectionReason("");
    setRejectModal({
      nominationId: nom.id,
      name: `${nom.first_name} ${nom.last_name}`,
    });
  };

  const submitReject = async () => {
    if (!rejectModal) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/admin/nominations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nominationId: rejectModal.nominationId,
          action: "reject",
          rejectionReason: rejectionReason.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to reject nomination");
        return;
      }
      setRejectModal(null);
      fetchNominations();
    } catch {
      setError("Failed to reject nomination");
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = (nom: Nomination) => {
    setConfirmDelete({
      id: nom.id,
      name: `${nom.first_name} ${nom.last_name}`,
    });
  };

  const submitDelete = async () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    setProcessing(true);
    try {
      const res = await fetch(
        `/api/admin/nominations?id=${encodeURIComponent(target.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete nomination");
        return;
      }
      fetchNominations();
    } catch {
      setError("Failed to delete nomination");
    } finally {
      setProcessing(false);
    }
  };

  const pendingCount = nominations.filter((n) => n.status === "pending").length;

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-8">Loading...</p>;
  }

  return (
    <div>
      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4">
          {error}
          <button
            onClick={() => setError("")}
            className="ml-2 underline text-xs"
          >
            dismiss
          </button>
        </div>
      )}

      {nominations.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">
          No nominations yet.
        </p>
      ) : (
        <>
          {pendingCount > 0 && (
            <p className="text-sm text-gray-500 mb-3">
              {pendingCount} pending{" "}
              {pendingCount === 1 ? "nomination" : "nominations"}
            </p>
          )}
          <div className="space-y-2">
            {nominations.map((nom) => (
              <div
                key={nom.id}
                className="relative bg-white border border-gray-200 rounded-xl p-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {nom.first_name} {nom.last_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatPhone(nom.phone)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Nominated by{" "}
                      <span className="font-medium">
                        {nom.nominator?.display_name || "Unknown"}
                      </span>{" "}
                      on{" "}
                      {new Date(nom.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    {nom.status === "pending" ? (
                      <>
                        <button
                          onClick={() => handleApprove(nom)}
                          disabled={processing}
                          className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg active:scale-95 transition-transform disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(nom)}
                          disabled={processing}
                          className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg active:scale-95 transition-transform disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${
                          nom.status === "approved"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {nom.status.charAt(0).toUpperCase() +
                          nom.status.slice(1)}
                      </span>
                    )}
                  </div>
                </div>

                {nom.status !== "pending" && nom.reviewer && (
                  <p className="text-xs text-gray-400 mt-1">
                    {nom.status === "approved" ? "Approved" : "Rejected"} by{" "}
                    {nom.reviewer.display_name}
                    {nom.reviewed_at &&
                      ` on ${new Date(nom.reviewed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                  </p>
                )}

                {nom.status === "rejected" && nom.rejection_reason && (
                  <p className="text-xs text-gray-500 mt-1 bg-red-50 p-2 rounded-lg pr-9">
                    {nom.rejection_reason}
                  </p>
                )}

                {nom.status === "rejected" && (
                  <button
                    onClick={() => handleDelete(nom)}
                    disabled={processing}
                    aria-label="Delete nomination"
                    title="Delete nomination"
                    className="absolute bottom-2 right-2 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg active:scale-95 transition disabled:opacity-50"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.8}
                      stroke="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed top-14 bottom-16 left-0 right-0 z-35 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setRejectModal(null)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100">
              <DragHandle onClose={() => setRejectModal(null)} className="mb-4" />
              <h2 className="text-xl font-bold text-gray-900">Reject Nomination</h2>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600 mb-3">
                Reject <span className="font-medium">{rejectModal.name}</span>?
                The nominator will see this rejection.
              </p>
              <textarea
                autoFocus
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Reason for rejection (optional)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                rows={3}
              />
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
              <button
                onClick={submitReject}
                disabled={processing}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold text-[15px] active:opacity-80 disabled:opacity-50"
              >
                {processing ? "Rejecting..." : "Reject"}
              </button>
              <button
                onClick={() => setRejectModal(null)}
                className="flex-1 py-3 border border-gray-300 rounded-xl font-semibold text-[15px] text-gray-600 active:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {approveModal && (
        <div className="fixed top-14 bottom-16 left-0 right-0 z-35 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setApproveModal(null)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100">
              <DragHandle onClose={() => setApproveModal(null)} className="mb-4" />
              <h2 className="text-xl font-bold text-gray-900">Approve Nomination</h2>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600 mb-3">
                Approve <span className="font-medium">{approveModal.name}</span>{" "}
                ({formatPhone(approveModal.phone)})? This will create their
                account.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invitation SMS
              </label>
              <textarea
                autoFocus
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                placeholder="Write a welcome message to send via SMS..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                rows={3}
              />
              <p className="text-xs text-gray-400 mt-1">
                Opens your phone&apos;s Messages app with this text pre-filled — you tap Send. Leave blank to skip.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
              <button
                onClick={submitApprove}
                disabled={processing}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-semibold text-[15px] active:opacity-80 disabled:opacity-50"
              >
                {processing ? "Approving..." : "Approve & Send"}
              </button>
              <button
                onClick={() => setApproveModal(null)}
                className="flex-1 py-3 border border-gray-300 rounded-xl font-semibold text-[15px] text-gray-600 active:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        title="Delete Nomination"
        message={
          confirmDelete
            ? `Permanently delete the rejected nomination for ${confirmDelete.name}? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={submitDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
