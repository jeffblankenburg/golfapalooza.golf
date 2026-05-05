"use client";

import { useState } from "react";
import { BTN_PRIMARY } from "@/lib/ui/buttons";

const TEE_COLORS: Record<string, string> = {
  Black: "bg-gray-900",
  Blue: "bg-blue-600",
  White: "bg-white border border-gray-300",
  Gold: "bg-yellow-500",
  Green: "bg-green-600",
  Red: "bg-red-600",
  Silver: "bg-gray-400",
};

interface TeeFormProps {
  courseId: string;
  tee?: {
    id: string;
    tee_name: string;
    tee_color: string | null;
    course_rating: number;
    slope_rating: number;
    par: number;
    total_yards: number | null;
    front_nine_rating: number | null;
    front_nine_slope: number | null;
    back_nine_rating: number | null;
    back_nine_slope: number | null;
  };
  onSaved: () => void;
  onCancel: () => void;
}

export default function TeeForm({ courseId, tee, onSaved, onCancel }: TeeFormProps) {
  const isEditing = !!tee;

  const [teeName, setTeeName] = useState(tee?.tee_name || "");
  const [teeColor, setTeeColor] = useState(tee?.tee_color || "");
  const [courseRating, setCourseRating] = useState(String(tee?.course_rating || "72.0"));
  const [slopeRating, setSlopeRating] = useState(String(tee?.slope_rating || "113"));
  const [par, setPar] = useState(String(tee?.par || "72"));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [frontRating, setFrontRating] = useState(String(tee?.front_nine_rating || ""));
  const [frontSlope, setFrontSlope] = useState(String(tee?.front_nine_slope || ""));
  const [backRating, setBackRating] = useState(String(tee?.back_nine_rating || ""));
  const [backSlope, setBackSlope] = useState(String(tee?.back_nine_slope || ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teeName.trim()) {
      setError("Tee name is required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (isEditing) {
        const res = await fetch(`/api/courses/${courseId}/tees`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tee_id: tee.id,
            tee_name: teeName,
            tee_color: teeColor || null,
            course_rating: courseRating ? parseFloat(courseRating) : null,
            slope_rating: slopeRating ? parseInt(slopeRating) : null,
            par: parseInt(par),
            front_nine_rating: frontRating ? parseFloat(frontRating) : null,
            front_nine_slope: frontSlope ? parseInt(frontSlope) : null,
            back_nine_rating: backRating ? parseFloat(backRating) : null,
            back_nine_slope: backSlope ? parseInt(backSlope) : null,
          }),
        });
        if (!res.ok) throw new Error("Failed to update tee");
      } else {
        const res = await fetch(`/api/courses/${courseId}/tees`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tee_name: teeName,
            tee_color: teeColor || null,
            course_rating: courseRating ? parseFloat(courseRating) : null,
            slope_rating: slopeRating ? parseInt(slopeRating) : null,
            par: parseInt(par),
          }),
        });
        if (!res.ok) throw new Error("Failed to create tee");
      }
      onSaved();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 bg-gray-50 rounded-lg p-4">
      {error && (
        <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tee Name *</label>
          <input
            type="text"
            value={teeName}
            onChange={(e) => setTeeName(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="e.g. Blue"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {Object.entries(TEE_COLORS).map(([name, bg]) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setTeeColor(name);
                  if (!teeName) setTeeName(name);
                }}
                title={name}
                className={`w-7 h-7 rounded-full ${bg} ${
                  teeColor === name ? "ring-2 ring-green-500 ring-offset-2" : ""
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
          <input
            type="number"
            step="0.1"
            value={courseRating}
            onChange={(e) => setCourseRating(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Slope</label>
          <input
            type="number"
            value={slopeRating}
            onChange={(e) => setSlopeRating(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Par</label>
          <input
            type="number"
            value={par}
            onChange={(e) => setPar(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className={BTN_PRIMARY}
      >
        {showAdvanced ? "Hide" : "Show"} 9-hole ratings
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Front 9 Rating</label>
            <input
              type="number"
              step="0.1"
              value={frontRating}
              onChange={(e) => setFrontRating(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Front 9 Slope</label>
            <input
              type="number"
              value={frontSlope}
              onChange={(e) => setFrontSlope(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Back 9 Rating</label>
            <input
              type="number"
              step="0.1"
              value={backRating}
              onChange={(e) => setBackRating(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Back 9 Slope</label>
            <input
              type="number"
              value={backSlope}
              onChange={(e) => setBackSlope(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : isEditing ? "Update Tee" : "Add Tee"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
