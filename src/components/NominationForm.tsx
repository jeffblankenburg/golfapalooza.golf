"use client";

import { useState, useEffect } from "react";

interface Nomination {
  id: string;
  phone: string;
  first_name: string;
  last_name: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  reviewer: { display_name: string } | null;
  created_at: string;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) return phone;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function NominationForm() {
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    phone: "",
    firstName: "",
    lastName: "",
  });

  const fetchNominations = async () => {
    try {
      const res = await fetch("/api/nominations");
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

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    setFormData({ ...formData, phone: formatPhone(digits) });
  };

  const handleDelete = async (nominationId: string) => {
    setNominations((prev) => prev.filter((n) => n.id !== nominationId));
    try {
      const res = await fetch("/api/nominations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nominationId }),
      });
      if (!res.ok) {
        fetchNominations();
      }
    } catch {
      fetchNominations();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/nominations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formData.phone,
          firstName: formData.firstName,
          lastName: formData.lastName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to submit nomination");
        return;
      }

      setSuccess(
        `${formData.firstName} ${formData.lastName} has been nominated! An admin will review your nomination.`
      );
      setFormData({ phone: "", firstName: "", lastName: "" });
      fetchNominations();
    } catch {
      setError("Failed to submit nomination");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Nomination Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm text-gray-500">
          Know someone who should join the trip? Nominate them below and an admin
          will review your nomination.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            First Name
          </label>
          <input
            type="text"
            autoFocus
            value={formData.firstName}
            onChange={(e) =>
              setFormData({ ...formData, firstName: e.target.value })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="First name"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Last Name
          </label>
          <input
            type="text"
            value={formData.lastName}
            onChange={(e) =>
              setFormData({ ...formData, lastName: e.target.value })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="Last name"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone Number
          </label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="(555) 555-5555"
            required
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 active:scale-[0.98] transition-transform"
        >
          {submitting ? "Submitting..." : "Submit Nomination"}
        </button>
      </form>

      {/* Past Nominations */}
      {!loading && nominations.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Your Nominations</h2>
          <div className="space-y-2">
            {nominations.map((nom) => (
              <div
                key={nom.id}
                className="bg-white border border-gray-200 rounded-xl p-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">
                      {nom.first_name} {nom.last_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatPhone(nom.phone)}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      nom.status === "pending"
                        ? "bg-yellow-100 text-yellow-700"
                        : nom.status === "approved"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {nom.status.charAt(0).toUpperCase() + nom.status.slice(1)}
                  </span>
                </div>

                {nom.status === "rejected" && (
                  <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <p>
                          Rejected by{" "}
                          <span className="font-medium">
                            {nom.reviewer?.display_name || "Admin"}
                          </span>
                        </p>
                        {nom.rejection_reason && (
                          <p className="mt-1 text-gray-600">
                            {nom.rejection_reason}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDelete(nom.id)}
                        className="ml-2 p-1 text-red-400 hover:text-red-600 shrink-0"
                        title="Remove"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-400 mt-1">
                  Nominated{" "}
                  {new Date(nom.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <p className="text-sm text-gray-400 text-center">Loading...</p>
      )}
    </div>
  );
}
