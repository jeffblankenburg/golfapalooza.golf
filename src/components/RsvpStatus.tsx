"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const likelihoodOptions = [
  { value: 99, label: "Attending", description: "99% - I'll be there" },
  { value: 75, label: "Probable", description: "75% - Looking good" },
  { value: 50, label: "Questionable", description: "50% - Still figuring it out" },
  { value: 25, label: "Doubtful", description: "25% - Unlikely but possible" },
];

function getLikelihoodLabel(value: number) {
  return likelihoodOptions.find((o) => o.value === value)?.label || "Unknown";
}

function getLikelihoodColor(value: number) {
  if (value >= 99) return "bg-green-100 text-green-800";
  if (value >= 75) return "bg-blue-100 text-blue-800";
  if (value >= 50) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

export function RsvpStatus({ likelihood }: { likelihood: number | null }) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [selectedLikelihood, setSelectedLikelihood] = useState<number | null>(likelihood);
  const [currentLikelihood, setCurrentLikelihood] = useState<number | null>(likelihood);
  const [saving, setSaving] = useState(false);

  const openModal = () => {
    setSelectedLikelihood(currentLikelihood || 99);
    setShowModal(true);
  };

  const confirmRsvp = async () => {
    if (!selectedLikelihood) return;
    setSaving(true);

    setCurrentLikelihood(selectedLikelihood);
    setShowModal(false);

    try {
      await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ likelihood: selectedLikelihood }),
      });
      router.refresh();
    } catch {
      setCurrentLikelihood(likelihood);
    }

    setSaving(false);
  };

  if (currentLikelihood === null) return null;

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Your Status
          </h2>
        </div>
        <button
          onClick={openModal}
          className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div
              className={`px-3 py-1 rounded-full text-sm font-semibold ${getLikelihoodColor(currentLikelihood)}`}
            >
              {getLikelihoodLabel(currentLikelihood)} {currentLikelihood}%
            </div>
          </div>
          <span className="text-xs text-green-700 font-medium">Change</span>
        </button>
      </div>

      {/* RSVP Modal */}
      {showModal && (
        <div className="fixed top-14 bottom-16 left-0 right-0 z-35 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowModal(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-6 pb-6 animate-slide-up max-h-[calc(100%-12px)] overflow-y-auto">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-6" />
            <h2 className="text-xl font-bold text-gray-900 text-center mb-6">
              How likely are you?
            </h2>
            <div className="space-y-3">
              {likelihoodOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedLikelihood(option.value)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-colors text-left ${
                    selectedLikelihood === option.value
                      ? "border-green-600 bg-green-50"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedLikelihood === option.value
                        ? "border-green-600"
                        : "border-gray-300"
                    }`}
                  >
                    {selectedLikelihood === option.value && (
                      <div className="w-2.5 h-2.5 rounded-full bg-green-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">
                      {option.label}
                    </p>
                    <p className="text-sm text-gray-500">
                      {option.description}
                    </p>
                  </div>
                  <span className="text-lg font-bold text-gray-400">
                    {option.value}%
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={confirmRsvp}
              disabled={!selectedLikelihood || saving}
              className="w-full mt-6 bg-green-600 text-white font-semibold text-lg py-3.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
            >
              {saving ? "Saving..." : "Confirm"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
