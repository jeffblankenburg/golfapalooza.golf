"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface TeeData {
  id: string;
  tee_name: string;
  course_rating: number;
  slope_rating: number;
  par: number;
}

interface HoleData {
  id: string;
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number;
  overhead_image_url: string | null;
  green_image_url: string | null;
}

interface CourseInfo {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function CourseManager({ courseId: propCourseId }: { courseId?: string } = {}) {
  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [tees, setTees] = useState<TeeData[]>([]);
  const [selectedTeeId, setSelectedTeeId] = useState<string | null>(null);
  const [holes, setHoles] = useState<HoleData[]>([]);
  const [tripId, setTripId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Course info form
  const [courseName, setCourseName] = useState("");
  const [courseCity, setCourseCity] = useState("");
  const [courseState, setCourseState] = useState("");
  const [infoStatus, setInfoStatus] = useState<SaveStatus>("idle");

  // Tee editing
  const [editingTee, setEditingTee] = useState<TeeData | null>(null);
  const [showAddTee, setShowAddTee] = useState(false);
  const [newTeeName, setNewTeeName] = useState("");
  const [newTeeRating, setNewTeeRating] = useState("72.0");
  const [newTeeSlope, setNewTeeSlope] = useState("113");
  const [newTeePar, setNewTeePar] = useState("72");
  const [teeStatus, setTeeStatus] = useState<SaveStatus>("idle");

  // Holes form
  const [holesStatus, setHolesStatus] = useState<SaveStatus>("idle");

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Image upload
  const [uploadingHole, setUploadingHole] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<{
    holeId: string;
    holeNumber: number;
    imageType: "overhead" | "green";
  } | null>(null);

  const loadCourse = useCallback(async (teeId?: string) => {
    setLoading(true);
    setError("");
    try {
      let url = "/api/admin/course";
      const params = new URLSearchParams();
      if (propCourseId) params.set("course_id", propCourseId);
      if (teeId) params.set("tee_id", teeId);
      if (params.toString()) url += `?${params.toString()}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      setTripId(data.trip_id);

      if (data.course) {
        setCourse(data.course);
        setTees(data.tees || []);
        setHoles(data.holes || []);
        setSelectedTeeId(data.selected_tee_id || null);

        setCourseName(data.course.name || "");
        setCourseCity(data.course.city || "");
        setCourseState(data.course.state || "");
      }
    } catch {
      setError("Failed to load course data");
    } finally {
      setLoading(false);
    }
  }, [propCourseId]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  async function switchTee(teeId: string) {
    setSelectedTeeId(teeId);
    setEditingTee(null);
    try {
      const params = new URLSearchParams({ tee_id: teeId });
      if (propCourseId) params.set("course_id", propCourseId);
      const res = await fetch(`/api/admin/course?${params.toString()}`);
      const data = await res.json();
      if (data.holes) setHoles(data.holes);
    } catch {
      setError("Failed to load tee data");
    }
  }

  async function createCourse() {
    setInfoStatus("saving");
    try {
      const res = await fetch("/api/admin/course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: courseName || "New Course",
          city: courseCity || null,
          state: courseState || null,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setInfoStatus("error");
        return;
      }
      setInfoStatus("saved");
      setTimeout(() => setInfoStatus("idle"), 2000);
      loadCourse();
    } catch {
      setError("Failed to create course");
      setInfoStatus("error");
    }
  }

  async function saveCourseInfo() {
    if (!course) return;
    setInfoStatus("saving");
    try {
      const res = await fetch("/api/admin/course", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: course.id,
          name: courseName,
          city: courseCity || null,
          state: courseState || null,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setInfoStatus("error");
        return;
      }
      setInfoStatus("saved");
      setTimeout(() => setInfoStatus("idle"), 2000);
    } catch {
      setError("Failed to save course info");
      setInfoStatus("error");
    }
  }

  async function addTee() {
    if (!course || !newTeeName.trim()) return;
    setTeeStatus("saving");
    try {
      const res = await fetch("/api/admin/course/tees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: course.id,
          tee_name: newTeeName.trim(),
          course_rating: parseFloat(newTeeRating) || 72.0,
          slope_rating: parseInt(newTeeSlope) || 113,
          par: parseInt(newTeePar) || 72,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setTeeStatus("error");
        return;
      }
      setTeeStatus("saved");
      setShowAddTee(false);
      setNewTeeName("");
      setNewTeeRating("72.0");
      setNewTeeSlope("113");
      setNewTeePar("72");
      setTimeout(() => setTeeStatus("idle"), 2000);
      loadCourse(data.tee?.id);
    } catch {
      setError("Failed to add tee");
      setTeeStatus("error");
    }
  }

  async function updateTee() {
    if (!editingTee) return;
    setTeeStatus("saving");
    try {
      const res = await fetch("/api/admin/course/tees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tee_id: editingTee.id,
          tee_name: editingTee.tee_name,
          course_rating: editingTee.course_rating,
          slope_rating: editingTee.slope_rating,
          par: editingTee.par,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setTeeStatus("error");
        return;
      }
      setTeeStatus("saved");
      setEditingTee(null);
      setTimeout(() => setTeeStatus("idle"), 2000);
      loadCourse(selectedTeeId || undefined);
    } catch {
      setError("Failed to update tee");
      setTeeStatus("error");
    }
  }

  async function duplicateTee(teeId: string) {
    if (!course) return;
    const sourceTee = tees.find((t) => t.id === teeId);
    const newName = sourceTee ? `${sourceTee.tee_name} (Copy)` : "Copy";
    setTeeStatus("saving");
    try {
      const res = await fetch("/api/admin/course/tees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: course.id,
          tee_name: newName,
          duplicate_from: teeId,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setTeeStatus("error");
        return;
      }
      setTeeStatus("saved");
      setEditingTee(null);
      setTimeout(() => setTeeStatus("idle"), 2000);
      loadCourse(data.tee?.id);
    } catch {
      setError("Failed to duplicate tee");
      setTeeStatus("error");
    }
  }

  function deleteTee(teeId: string) {
    if (!course) return;
    setConfirmModal({
      title: "Delete Tee Box",
      message: "Delete this tee box and all its hole data?",
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await fetch(
            `/api/admin/course/tees?tee_id=${teeId}&course_id=${course.id}`,
            { method: "DELETE" }
          );
          const data = await res.json();
          if (data.error) {
            setError(data.error);
            return;
          }
          loadCourse();
        } catch {
          setError("Failed to delete tee");
        }
      },
    });
  }

  async function saveHoles() {
    setHolesStatus("saving");
    try {
      const res = await fetch("/api/admin/course/holes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holes: holes.map((h) => ({
            id: h.id,
            par: h.par,
            handicap_index: h.handicap_index,
            yards: h.yards,
          })),
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setHolesStatus("error");
        return;
      }
      setHolesStatus("saved");
      setTimeout(() => setHolesStatus("idle"), 2000);
    } catch {
      setError("Failed to save holes");
      setHolesStatus("error");
    }
  }

  function updateHole(
    index: number,
    field: "par" | "handicap_index" | "yards",
    value: string
  ) {
    const updated = [...holes];
    updated[index] = { ...updated[index], [field]: parseInt(value) || 0 };
    setHoles(updated);
  }

  function triggerUpload(
    holeId: string,
    holeNumber: number,
    imageType: "overhead" | "green"
  ) {
    pendingUpload.current = { holeId, holeNumber, imageType };
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const upload = pendingUpload.current;
    if (!file || !upload || !course) return;

    const key = `${upload.holeId}-${upload.imageType}`;
    setUploadingHole(key);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("holeId", upload.holeId);
      formData.append("imageType", upload.imageType);
      formData.append("courseId", course.id);
      formData.append("holeNumber", upload.holeNumber.toString());

      const res = await fetch("/api/admin/course/holes/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }

      setHoles((prev) =>
        prev.map((h) =>
          h.id === upload.holeId
            ? {
                ...h,
                [upload.imageType === "overhead"
                  ? "overhead_image_url"
                  : "green_image_url"]: data.url,
              }
            : h
        )
      );
    } catch {
      setError("Failed to upload image");
    } finally {
      setUploadingHole(null);
      pendingUpload.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-[3px] border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // No course yet — show create form
  if (!course) {
    return (
      <div className="space-y-4">
        {!tripId && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            No active trip found. Create a trip first in Trip Settings.
          </div>
        )}
        {tripId && (
          <>
            <p className="text-gray-500 text-sm">
              No course linked to this trip yet. Create one to get started.
            </p>
            <Field
              label="Course Name"
              value={courseName}
              onChange={setCourseName}
              placeholder="e.g. Alpine Lake Resort"
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="City"
                value={courseCity}
                onChange={setCourseCity}
                placeholder="Terra Alta"
              />
              <Field
                label="State"
                value={courseState}
                onChange={setCourseState}
                placeholder="WV"
              />
            </div>
            <button
              onClick={createCourse}
              disabled={infoStatus === "saving"}
              className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
            >
              {infoStatus === "saving" ? "Creating..." : "Create Course"}
            </button>
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  const selectedTee = tees.find((t) => t.id === selectedTeeId);
  const isFirstTee = tees.length > 0 && tees[0].id === selectedTeeId;

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
          <button
            onClick={() => setError("")}
            className="ml-2 font-semibold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Course Info Section */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">Course Info</h2>
        </div>
        <div className="p-4 space-y-3">
          <Field
            label="Course Name"
            value={courseName}
            onChange={setCourseName}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" value={courseCity} onChange={setCourseCity} />
            <Field label="State" value={courseState} onChange={setCourseState} />
          </div>
          <button
            onClick={saveCourseInfo}
            disabled={infoStatus === "saving"}
            className="w-full bg-green-600 text-white font-semibold py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
          >
            {infoStatus === "saving"
              ? "Saving..."
              : infoStatus === "saved"
                ? "Saved!"
                : "Save Course Info"}
          </button>
        </div>
      </section>

      {/* Tee Boxes Section */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">Tee Boxes</h2>
        </div>

        {/* Tee tab bar */}
        <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto border-b border-gray-100">
          {tees.map((tee) => (
            <button
              key={tee.id}
              onClick={() => switchTee(tee.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
                tee.id === selectedTeeId
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600 active:bg-gray-200"
              }`}
            >
              {tee.tee_name}
              {tee.id === selectedTeeId && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingTee({ ...tee });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      setEditingTee({ ...tee });
                    }
                  }}
                  className="ml-1 w-5 h-5 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 cursor-pointer"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => {
              setShowAddTee(true);
              setEditingTee(null);
            }}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-500 active:bg-gray-200 shrink-0"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v12m6-6H6"
              />
            </svg>
          </button>
        </div>

        {/* Edit tee form */}
        {editingTee && (
          <div className="p-4 bg-green-50 border-b border-green-100 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Tee Name"
                value={editingTee.tee_name}
                onChange={(v) =>
                  setEditingTee({ ...editingTee, tee_name: v })
                }
              />
              <Field
                label="Par"
                value={editingTee.par.toString()}
                onChange={(v) =>
                  setEditingTee({ ...editingTee, par: parseInt(v) || 72 })
                }
                type="number"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Rating"
                value={editingTee.course_rating.toString()}
                onChange={(v) =>
                  setEditingTee({
                    ...editingTee,
                    course_rating: parseFloat(v) || 72.0,
                  })
                }
                type="number"
              />
              <Field
                label="Slope"
                value={editingTee.slope_rating.toString()}
                onChange={(v) =>
                  setEditingTee({
                    ...editingTee,
                    slope_rating: parseInt(v) || 113,
                  })
                }
                type="number"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={updateTee}
                disabled={teeStatus === "saving"}
                className="flex-1 bg-green-600 text-white font-semibold py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50 text-sm"
              >
                {teeStatus === "saving" ? "Saving..." : "Save Tee"}
              </button>
              <button
                onClick={() => duplicateTee(editingTee.id)}
                disabled={teeStatus === "saving"}
                className="px-4 py-2 bg-blue-50 text-blue-600 font-semibold rounded-xl active:scale-95 transition-transform disabled:opacity-50 text-sm"
              >
                Duplicate
              </button>
              {tees.length > 1 && (
                <button
                  onClick={() => deleteTee(editingTee.id)}
                  className="px-4 py-2 bg-red-50 text-red-600 font-semibold rounded-xl active:scale-95 transition-transform text-sm"
                >
                  Delete
                </button>
              )}
              <button
                onClick={() => setEditingTee(null)}
                className="px-4 py-2 bg-gray-100 text-gray-600 font-semibold rounded-xl active:scale-95 transition-transform text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Add tee form */}
        {showAddTee && (
          <div className="p-4 bg-blue-50 border-b border-blue-100 space-y-3">
            <p className="text-sm font-semibold text-gray-700">
              Add Tee Box
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Tee Name"
                value={newTeeName}
                onChange={setNewTeeName}
                placeholder="e.g. Blue"
                autoFocus
              />
              <Field
                label="Par"
                value={newTeePar}
                onChange={setNewTeePar}
                type="number"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Rating"
                value={newTeeRating}
                onChange={setNewTeeRating}
                type="number"
              />
              <Field
                label="Slope"
                value={newTeeSlope}
                onChange={setNewTeeSlope}
                type="number"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={addTee}
                disabled={teeStatus === "saving" || !newTeeName.trim()}
                className="flex-1 bg-green-600 text-white font-semibold py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50 text-sm"
              >
                {teeStatus === "saving" ? "Adding..." : "Add Tee"}
              </button>
              <button
                onClick={() => setShowAddTee(false)}
                className="px-4 py-2 bg-gray-100 text-gray-600 font-semibold rounded-xl active:scale-95 transition-transform text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Selected tee info summary */}
        {selectedTee && !editingTee && (
          <div className="px-4 py-2 flex items-center gap-4 text-xs text-gray-500">
            <span>Rating {selectedTee.course_rating}</span>
            <span>Slope {selectedTee.slope_rating}</span>
            <span>Par {selectedTee.par}</span>
          </div>
        )}
      </section>

      {/* Holes Section */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Hole Details
            {selectedTee && (
              <span className="font-normal text-gray-400">
                {" "}
                — {selectedTee.tee_name}
              </span>
            )}
          </h2>
          <button
            onClick={saveHoles}
            disabled={holesStatus === "saving"}
            className="px-3 py-1 bg-green-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
          >
            {holesStatus === "saving"
              ? "Saving..."
              : holesStatus === "saved"
                ? "Saved!"
                : "Save All"}
          </button>
        </div>
        <div className="divide-y divide-gray-100">
          {holes.map((hole, i) => (
            <HoleRow
              key={hole.id}
              hole={hole}
              courseId={course.id}
              showImages={isFirstTee}
              onUpdate={(field, value) => updateHole(i, field, value)}
              onUpload={(imageType) =>
                triggerUpload(hole.id, hole.hole_number, imageType)
              }
              uploadingKey={uploadingHole}
            />
          ))}
        </div>
      </section>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />

      <ConfirmModal
        open={confirmModal !== null}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        destructive
        confirmLabel="Delete"
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
      />
    </div>
  );
}

function HoleRow({
  hole,
  courseId,
  showImages,
  onUpdate,
  onUpload,
  uploadingKey,
}: {
  hole: HoleData;
  courseId: string;
  showImages: boolean;
  onUpdate: (field: "par" | "handicap_index" | "yards", value: string) => void;
  onUpload: (imageType: "overhead" | "green") => void;
  uploadingKey: string | null;
}) {
  const isUploadingOverhead = uploadingKey === `${hole.id}-overhead`;
  const isUploadingGreen = uploadingKey === `${hole.id}-green`;

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3 mb-2">
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-50 text-green-700 text-sm font-bold shrink-0">
          {hole.hole_number}
        </span>
        <div className="grid grid-cols-3 gap-2 flex-1">
          <div>
            <label className="text-[10px] text-gray-400 uppercase">Par</label>
            <input
              type="number"
              value={hole.par}
              onChange={(e) => onUpdate("par", e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase">Hdcp</label>
            <input
              type="number"
              value={hole.handicap_index}
              onChange={(e) => onUpdate("handicap_index", e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase">
              Yards
            </label>
            <input
              type="number"
              value={hole.yards}
              onChange={(e) => onUpdate("yards", e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
            />
          </div>
        </div>
      </div>

      {/* Image uploads — only shown on first tee since images are shared */}
      {showImages && (
        <div className="flex gap-2 ml-11">
          <ImageButton
            label="Overhead"
            imageUrl={hole.overhead_image_url}
            uploading={isUploadingOverhead}
            onClick={() => onUpload("overhead")}
          />
          <ImageButton
            label="Green"
            imageUrl={hole.green_image_url}
            uploading={isUploadingGreen}
            onClick={() => onUpload("green")}
          />
        </div>
      )}
    </div>
  );
}

function ImageButton({
  label,
  imageUrl,
  uploading,
  onClick,
}: {
  label: string;
  imageUrl: string | null;
  uploading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={uploading}
      className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-xs active:bg-gray-50 transition-colors disabled:opacity-50"
    >
      {uploading ? (
        <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      ) : imageUrl ? (
        <div className="w-4 h-4 rounded bg-green-100 flex items-center justify-center">
          <svg
            className="w-3 h-3 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      ) : (
        <svg
          className="w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      )}
      <span className="text-gray-600">{label}</span>
    </button>
  );
}
