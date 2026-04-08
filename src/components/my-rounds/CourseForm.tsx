"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TEE_COLORS: Record<string, string> = {
  Black: "bg-gray-900",
  Blue: "bg-blue-600",
  White: "bg-white border border-gray-300",
  Gold: "bg-yellow-500",
  Green: "bg-green-600",
  Red: "bg-red-600",
  Silver: "bg-gray-400",
};

interface CourseFormProps {
  course?: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    address: string | null;
    phone: string | null;
    website: string | null;
    hole_count: 9 | 18;
  };
}

export default function CourseForm({ course }: CourseFormProps) {
  const router = useRouter();
  const isEditing = !!course;

  const [name, setName] = useState(course?.name || "");
  const [city, setCity] = useState(course?.city || "");
  const [state, setState] = useState(course?.state || "");
  const [address, setAddress] = useState(course?.address || "");
  const [phone, setPhone] = useState(course?.phone || "");
  const [website, setWebsite] = useState(course?.website || "");
  const [holeCount, setHoleCount] = useState<9 | 18>(course?.hole_count || 18);

  // Initial tee fields (only for new courses)
  const [teeName, setTeeName] = useState("White");
  const [teeColor, setTeeColor] = useState("White");
  const [courseRating, setCourseRating] = useState("");
  const [slopeRating, setSlopeRating] = useState("");
  const [par, setPar] = useState("72");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Course name is required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (isEditing) {
        const res = await fetch(`/api/courses/${course.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, city, state, address, phone, website, hole_count: holeCount }),
        });
        if (!res.ok) throw new Error("Failed to update course");
        router.push(`/my-rounds/courses/${course.id}`);
        router.refresh();
      } else {
        const res = await fetch("/api/courses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            city,
            state,
            address,
            phone,
            website,
            hole_count: holeCount,
            tee_name: teeName,
            tee_color: teeColor,
            course_rating: courseRating ? parseFloat(courseRating) : null,
            slope_rating: slopeRating ? parseInt(slopeRating) : null,
            par: parseInt(par),
          }),
        });
        if (!res.ok) throw new Error("Failed to create course");
        const data = await res.json();
        router.push(`/my-rounds/courses/${data.course.id}`);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Course Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          placeholder="e.g. Pine Valley Golf Club"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
          <input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="e.g. OH"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          placeholder="e.g. 1234 Fairway Dr"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Holes</label>
        <div className="flex gap-2">
          {([18, 9] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setHoleCount(n);
                if (!isEditing) setPar(n === 9 ? "36" : "72");
              }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                holeCount === n
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {n} Holes
            </button>
          ))}
        </div>
      </div>

      {!isEditing && (
        <>
          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Initial Tee Box</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tee Name</label>
              <input
                type="text"
                value={teeName}
                onChange={(e) => setTeeName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="e.g. White"
              />
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(TEE_COLORS).map(([name, bg]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setTeeColor(name);
                      if (!teeName || Object.keys(TEE_COLORS).includes(teeName)) setTeeName(name);
                    }}
                    title={name}
                    className={`w-8 h-8 rounded-full ${bg} ${
                      teeColor === name ? "ring-2 ring-green-500 ring-offset-2" : ""
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Par</label>
                <input
                  type="number"
                  value={par}
                  onChange={(e) => setPar(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Course Rating</label>
                <input
                  type="number"
                  step="0.1"
                  value={courseRating}
                  onChange={(e) => setCourseRating(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slope Rating</label>
                <input
                  type="number"
                  value={slopeRating}
                  onChange={(e) => setSlopeRating(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        {saving ? "Saving..." : isEditing ? "Update Course" : "Create Course"}
      </button>
    </form>
  );
}
