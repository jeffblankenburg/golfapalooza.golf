"use client";

import { useState, useEffect } from "react";

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
      `Hey ${nom.first_name}! You've been invited to join Golfapalooza. Download the app and log in with your phone number to get started!`
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

      // Open native SMS with the invite message
      if (inviteMessage.trim() && data.phone) {
        const smsUrl = `sms:+1${data.phone}&body=${encodeURIComponent(inviteMessage.trim())}`;
        window.open(smsUrl, "_blank");
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
                className="bg-white border border-gray-200 rounded-xl p-3"
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
                  <p className="text-xs text-gray-500 mt-1 bg-red-50 p-2 rounded-lg">
                    {nom.rejection_reason}
                  </p>
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
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
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
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
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
                This message will be sent to the new rookie via SMS. Leave blank to skip.
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
    </div>
  );
}
