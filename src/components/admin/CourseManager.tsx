"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { TEE_COLOR_OPTIONS, isHexColor, getContrastText, getTeeColorClasses } from "@/lib/tee-colors";
import dynamic from "next/dynamic";

const HoleMapEditor = dynamic(() => import("@/components/admin/HoleMapEditor"), { ssr: false });

interface TeeData {
  id: string;
  tee_name: string;
  tee_color: string | null;
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
  tee_latitude: number | null;
  tee_longitude: number | null;
  green_latitude: number | null;
  green_longitude: number | null;
  drive_latitude: number | null;
  drive_longitude: number | null;
  green_front_latitude: number | null;
  green_front_longitude: number | null;
  green_back_latitude: number | null;
  green_back_longitude: number | null;
}

interface CourseInfo {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  locked: boolean;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function CourseManager({ courseId: propCourseId }: { courseId?: string } = {}) {
  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [tees, setTees] = useState<TeeData[]>([]);
  const [selectedTeeId, setSelectedTeeId] = useState<string | null>(null);
  const [selectedTeeIsComposition, setSelectedTeeIsComposition] = useState(false);
  const [holes, setHoles] = useState<HoleData[]>([]);
  const [tripId, setTripId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Course info form
  const [courseName, setCourseName] = useState("");
  const [courseCity, setCourseCity] = useState("");
  const [courseState, setCourseState] = useState("");
  const [courseAddress, setCourseAddress] = useState("");
  const [coursePhone, setCoursePhone] = useState("");
  const [courseWebsite, setCourseWebsite] = useState("");
  const [infoStatus, setInfoStatus] = useState<SaveStatus>("idle");

  // Tee editing
  const [editingTee, setEditingTee] = useState<TeeData | null>(null);
  const [showAddTee, setShowAddTee] = useState(false);
  const [newTeeName, setNewTeeName] = useState("");
  const [newTeeColor, setNewTeeColor] = useState<string | null>(null);
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
        setCourseAddress(data.course.address || "");
        setCoursePhone(data.course.phone || "");
        setCourseWebsite(data.course.website || "");
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
          address: courseAddress || null,
          phone: coursePhone || null,
          website: courseWebsite || null,
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
          tee_color: newTeeColor,
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
      setNewTeeColor(null);
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
          tee_color: editingTee.tee_color,
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

  async function deleteImage(holeId: string, imageType: "overhead" | "green") {
    const key = `${holeId}-${imageType}`;
    setUploadingHole(key);
    try {
      const res = await fetch(
        `/api/admin/course/holes/upload?holeId=${holeId}&imageType=${imageType}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setHoles((prev) =>
        prev.map((h) =>
          h.id === holeId
            ? {
                ...h,
                [imageType === "overhead"
                  ? "overhead_image_url"
                  : "green_image_url"]: null,
              }
            : h
        )
      );
    } catch {
      setError("Failed to delete image");
    } finally {
      setUploadingHole(null);
    }
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
                  : "green_image_url"]: `${data.url}?t=${Date.now()}`,
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

  // Sort tees by course rating descending
  const sortedTees = [...tees].sort((a, b) => b.course_rating - a.course_rating);
  const selectedTee = sortedTees.find((t) => t.id === selectedTeeId);

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
          <Field label="Address" value={courseAddress} onChange={setCourseAddress} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" value={coursePhone} onChange={setCoursePhone} />
            <Field label="Website" value={courseWebsite} onChange={setCourseWebsite} />
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
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div>
              <div className="text-sm font-medium text-gray-700">
                {course?.locked ? "Course locked" : "Course unlocked"}
              </div>
              <div className="text-xs text-gray-500">
                {course?.locked ? "Only admins can edit" : "Any user can edit"}
              </div>
            </div>
            <button
              onClick={async () => {
                if (!course) return;
                const res = await fetch(`/api/courses/${course.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ locked: !course.locked }),
                });
                if (res.ok) {
                  setCourse({ ...course, locked: !course.locked });
                }
              }}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                course?.locked
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "bg-amber-500 text-white hover:bg-amber-600"
              }`}
            >
              {course?.locked ? "Unlock" : "Lock"}
            </button>
          </div>
        </div>
      </section>

      {/* Tee Boxes Section */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">Tee Boxes</h2>
        </div>

        {/* Tee tab bar */}
        <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto border-b border-gray-100">
          {sortedTees.map((tee) => {
            const colors = getTeeColorClasses(tee.tee_color);
            const isSelected = tee.id === selectedTeeId;
            return (
            <button
              key={tee.id}
              onClick={() => switchTee(tee.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
                colors.isCustom
                  ? `${colors.text} ${isSelected ? "" : "opacity-60"}`
                  : isSelected
                    ? `${colors.bg} ${colors.text} ring-2 ${colors.ring} ring-offset-1`
                    : `${colors.bg} ${colors.text} opacity-60`
              }`}
              style={colors.isCustom ? {
                ...(colors.isGradient
                  ? { background: colors.gradientHex! }
                  : { backgroundColor: colors.hex! }),
                ...(isSelected ? { outlineColor: colors.hex || "#9ca3af", outlineWidth: "2px", outlineStyle: "solid", outlineOffset: "2px" } : {}),
              } : undefined}
            >
              {tee.tee_name}
              {isSelected && (
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
          );
          })}
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
            {!(editingTee.tee_color && editingTee.tee_color.includes("/")) && (
              <TeeColorPicker
                value={editingTee.tee_color}
                onChange={(v) => setEditingTee({ ...editingTee, tee_color: v })}
              />
            )}
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
            <TeeColorPicker value={newTeeColor} onChange={setNewTeeColor} />
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

      {/* Composition Tee Section */}
      {selectedTee && tees.length > 1 && (
        <CompositionTeeEditor
          teeId={selectedTee.id}
          teeName={selectedTee.tee_name}
          otherTees={tees.filter((t) => t.id !== selectedTee.id)}
          onCompositionChange={setSelectedTeeIsComposition}
          onTeeColorChange={(color) => {
            setTees((prev) => prev.map((t) => t.id === selectedTee.id ? { ...t, tee_color: color } : t));
          }}
        />
      )}

      {/* Holes Section — hidden for composition tees */}
      {!selectedTeeIsComposition && (
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
          {holes.map((hole, i) => {
            const prev = holes.find((h) => h.hole_number === hole.hole_number - 1);
            const previousHoleGreen: [number, number] | null =
              prev && prev.green_latitude != null && prev.green_longitude != null
                ? [prev.green_latitude, prev.green_longitude]
                : null;
            return (
            <HoleRow
              key={hole.id}
              hole={hole}
              holeIndex={i}
              totalHoles={holes.length}
              courseId={course.id}
              courseName={courseName}
              teeName={selectedTee?.tee_name || ""}
              showImages
              onUpdate={(field, value) => updateHole(i, field, value)}
              onUpload={(imageType) =>
                triggerUpload(hole.id, hole.hole_number, imageType)
              }
              onDelete={(imageType) => deleteImage(hole.id, imageType)}
              onMapSave={async (holeId, coords) => {
                await fetch("/api/admin/course/holes/coordinates", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ hole_id: holeId, ...coords }),
                });
                // Update local state
                setHoles((prev) => prev.map((h) =>
                  h.id === holeId ? { ...h, ...coords } : h
                ));
              }}
              uploadingKey={uploadingHole}
              courseLatitude={course.latitude}
              courseLongitude={course.longitude}
              courseAddress={course.address}
              courseCity={course.city}
              courseState={course.state}
              previousHoleGreen={previousHoleGreen}
            />
            );
          })}
        </div>
      </section>
      )}

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
  holeIndex,
  totalHoles,
  courseId,
  courseName,
  teeName,
  showImages,
  onUpdate,
  onUpload,
  onDelete,
  onMapSave,
  uploadingKey,
  courseLatitude,
  courseLongitude,
  courseAddress,
  courseCity,
  courseState,
  previousHoleGreen,
}: {
  hole: HoleData;
  holeIndex: number;
  totalHoles: number;
  courseId: string;
  courseName: string;
  teeName: string;
  showImages: boolean;
  onUpdate: (field: "par" | "handicap_index" | "yards", value: string) => void;
  onUpload: (imageType: "overhead" | "green") => void;
  onDelete: (imageType: "overhead" | "green") => void;
  onMapSave: (holeId: string, coords: Record<string, number | null>) => void;
  uploadingKey: string | null;
  courseLatitude: number | null;
  courseLongitude: number | null;
  courseAddress: string | null;
  courseCity: string | null;
  courseState: string | null;
  previousHoleGreen: [number, number] | null;
}) {
  const [showMap, setShowMap] = useState(false);
  const isUploadingOverhead = uploadingKey === `${hole.id}-overhead`;
  const isUploadingGreen = uploadingKey === `${hole.id}-green`;
  const modalSubtitle = `${courseName} · ${teeName} · Hole ${hole.hole_number}`;
  const hasCoordinates = hole.tee_latitude != null || hole.green_latitude != null;

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
              tabIndex={holeIndex + 1}
              value={hole.par}
              onChange={(e) => onUpdate("par", e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase">Hdcp</label>
            <input
              type="number"
              tabIndex={totalHoles + holeIndex + 1}
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
              tabIndex={totalHoles * 2 + holeIndex + 1}
              value={hole.yards}
              onChange={(e) => onUpdate("yards", e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
            />
          </div>
        </div>
      </div>

      {showImages && (
        <div className="flex gap-2 ml-11">
          <ImageButton
            label="Overhead"
            subtitle={modalSubtitle}
            imageUrl={hole.overhead_image_url}
            uploading={isUploadingOverhead}
            onUpload={() => onUpload("overhead")}
            onDelete={() => onDelete("overhead")}
          />
          <ImageButton
            label="Green"
            subtitle={modalSubtitle}
            imageUrl={hole.green_image_url}
            uploading={isUploadingGreen}
            onUpload={() => onUpload("green")}
            onDelete={() => onDelete("green")}
          />
          <button
            onClick={() => setShowMap(true)}
            className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-xs active:bg-gray-50 transition-colors"
          >
            {hasCoordinates ? (
              <div className="w-4 h-4 rounded bg-green-100 flex items-center justify-center">
                <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
            <span className="text-gray-600">Map</span>
          </button>
        </div>
      )}

      {showMap && (
        <HoleMapEditor
          holeNumber={hole.hole_number}
          courseId={courseId}
          courseLatitude={courseLatitude}
          courseLongitude={courseLongitude}
          courseAddress={courseAddress}
          courseName={courseName}
          courseCity={courseCity}
          courseState={courseState}
          previousHoleGreen={previousHoleGreen}
          coordinates={{
            tee_latitude: hole.tee_latitude,
            tee_longitude: hole.tee_longitude,
            green_latitude: hole.green_latitude,
            green_longitude: hole.green_longitude,
            drive_latitude: hole.drive_latitude,
            drive_longitude: hole.drive_longitude,
            green_front_latitude: hole.green_front_latitude,
            green_front_longitude: hole.green_front_longitude,
            green_back_latitude: hole.green_back_latitude,
            green_back_longitude: hole.green_back_longitude,
          }}
          onSave={(coords) => {
            onMapSave(hole.id, coords as unknown as Record<string, number | null>);
            setShowMap(false);
          }}
          onClose={() => setShowMap(false)}
        />
      )}
    </div>
  );
}

function ImageButton({
  label,
  subtitle,
  imageUrl,
  uploading,
  onUpload,
  onDelete,
}: {
  label: string;
  subtitle: string;
  imageUrl: string | null;
  uploading: boolean;
  onUpload: () => void;
  onDelete: () => void;
}) {
  const [showModal, setShowModal] = useState(false);

  if (uploading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-xs opacity-50">
        <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-gray-600">{label}</span>
      </div>
    );
  }

  // No image — show upload button
  if (!imageUrl) {
    return (
      <button
        onClick={onUpload}
        className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-xs active:bg-gray-50 transition-colors"
      >
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
        <span className="text-gray-600">{label}</span>
      </button>
    );
  }

  // Has image — show checkmark, click opens modal
  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-xs active:bg-gray-50 transition-colors"
      >
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
        <span className="text-gray-600">{label}</span>
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowModal(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-6 pb-8 animate-slide-up max-h-[85vh] overflow-y-auto">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900">{label}</h3>
            <p className="text-sm text-gray-500 mb-4">{subtitle}</p>
            <img
              src={imageUrl}
              alt={label}
              className="w-full rounded-xl border border-gray-200 mb-6"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  onUpload();
                }}
                className="flex-1 bg-green-600 text-white font-semibold py-3 rounded-xl active:scale-95 transition-transform text-sm"
              >
                Replace
              </button>
              <button
                onClick={() => {
                  setShowModal(false);
                  onDelete();
                }}
                className="flex-1 bg-red-50 text-red-600 font-semibold py-3 rounded-xl active:scale-95 transition-transform text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TeeColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const isCustom = isHexColor(value);
  const currentColor = getTeeColorClasses(value);
  const hasColor = value !== null;

  return (
    <>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">
          Color
        </label>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          {hasColor ? (
            <span
              className={`w-5 h-5 rounded-full shrink-0 ${isCustom ? "" : currentColor.bg}`}
              style={isCustom ? { backgroundColor: value! } : undefined}
            />
          ) : (
            <span className="w-5 h-5 rounded-full shrink-0 border-2 border-dashed border-gray-300" />
          )}
          <span className="text-gray-700">
            {hasColor
              ? isCustom
                ? value
                : TEE_COLOR_OPTIONS.find((o) => o.value === value)?.label || value
              : "Choose a color"}
          </span>
        </button>
      </div>

      {showModal && (
        <TeeColorModal
          value={value}
          onChange={onChange}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

function TeeColorModal({
  value,
  onChange,
  onClose,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  onClose: () => void;
}) {
  const isCustom = isHexColor(value);
  const [customHex, setCustomHex] = useState(isCustom ? value! : "#6b7280");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-6 pb-8 animate-slide-up">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
        <h3 className="text-lg font-bold text-gray-900 mb-1">Tee Color</h3>
        <p className="text-sm text-gray-500 mb-5">Choose a preset or pick a custom color</p>

        {/* Presets */}
        <div className="flex flex-wrap gap-3 mb-6">
          {TEE_COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                onClose();
              }}
              className={`w-10 h-10 rounded-full ${opt.bg} ${
                value === opt.value
                  ? `ring-2 ${opt.ring} ring-offset-2`
                  : ""
              }`}
              title={opt.label}
            />
          ))}
        </div>

        {/* Custom picker */}
        <div className="flex items-center gap-3 mb-6">
          <input
            type="color"
            value={customHex}
            onChange={(e) => setCustomHex(e.target.value)}
            className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
          />
          <input
            type="text"
            value={customHex}
            onChange={(e) => {
              const v = e.target.value;
              setCustomHex(v);
            }}
            maxLength={7}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="#000000"
          />
          <button
            type="button"
            onClick={() => {
              if (isHexColor(customHex)) {
                onChange(customHex);
                onClose();
              }
            }}
            disabled={!isHexColor(customHex)}
            className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl active:scale-95 transition-transform disabled:opacity-50"
          >
            Apply
          </button>
        </div>

        {/* Clear / Cancel */}
        <div className="flex gap-3">
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                onClose();
              }}
              className="flex-1 py-3 bg-gray-100 text-gray-600 font-semibold rounded-xl active:scale-95 transition-transform text-sm"
            >
              Clear Color
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-gray-100 text-gray-600 font-semibold rounded-xl active:scale-95 transition-transform text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Composition Tee Editor ──

function CompositionTeeEditor({
  teeId,
  teeName,
  otherTees,
  onCompositionChange,
  onTeeColorChange,
}: {
  teeId: string;
  teeName: string;
  otherTees: { id: string; tee_name: string; course_rating: number }[];
  onCompositionChange?: (isComposition: boolean) => void;
  onTeeColorChange?: (color: string) => void;
}) {
  const [isComposition, setIsComposition] = useState(false);
  const [mappings, setMappings] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eligibleTees, setEligibleTees] = useState(otherTees);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/admin/course/composition-tees?tee_id=${teeId}`);
      const data = await res.json();

      // Filter out other composition tees from the dropdowns
      const compositionIds: string[] = data.compositionTeeIds || [];
      setEligibleTees(otherTees.filter((t) => !compositionIds.includes(t.id)));

      const m = data.mappings || [];
      if (m.length > 0) {
        setIsComposition(true);
        onCompositionChange?.(true);
        const map: Record<number, string> = {};
        for (const entry of m) {
          map[entry.hole_number] = entry.source_tee_id;
        }
        setMappings(map);
      } else {
        setIsComposition(false);
        onCompositionChange?.(false);
        setMappings({});
      }
      setLoading(false);
    }
    load();
  }, [teeId]);

  const handleToggle = async () => {
    if (isComposition) {
      // Remove composition — delete all mappings
      await fetch("/api/admin/course/composition-tees", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tee_id: teeId }),
      });
      setIsComposition(false);
      onCompositionChange?.(false);
      setMappings({});
    } else {
      // Enable composition — default all holes to first eligible (non-composition) tee
      const defaultTeeId = eligibleTees[0]?.id;
      if (!defaultTeeId) return;
      const newMappings: Record<number, string> = {};
      for (let h = 1; h <= 18; h++) {
        newMappings[h] = defaultTeeId;
      }
      setMappings(newMappings);
      setIsComposition(true);
      onCompositionChange?.(true);
      await saveMappings(newMappings);
    }
  };

  const saveMappings = async (m: Record<number, string>) => {
    setSaving(true);
    const arr = Object.entries(m).map(([holeNum, sourceTeeId]) => ({
      hole_number: parseInt(holeNum),
      source_tee_id: sourceTeeId,
    }));
    await fetch("/api/admin/course/composition-tees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tee_id: teeId, mappings: arr }),
    });

    // Auto-set the tee color to a gradient name (e.g., "Black/Blue"), harder tee first
    const uniqueSourceIds = [...new Set(Object.values(m))];
    const sourceTees = uniqueSourceIds
      .map((id) => eligibleTees.find((t) => t.id === id))
      .filter((t): t is { id: string; tee_name: string; course_rating: number } => !!t)
      .sort((a, b) => b.course_rating - a.course_rating);
    if (sourceTees.length >= 2) {
      const gradientColor = sourceTees.map((t) => t.tee_name).join("/");
      await fetch("/api/admin/course/tees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tee_id: teeId, tee_color: gradientColor }),
      });
      onTeeColorChange?.(gradientColor);
    }

    setSaving(false);
  };

  const updateHole = (holeNumber: number, sourceTeeId: string) => {
    const updated = { ...mappings, [holeNumber]: sourceTeeId };
    setMappings(updated);
    saveMappings(updated);
  };

  if (loading) return null;

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Composition Tee</h2>
          <p className="text-xs text-gray-400">Combine holes from multiple tee boxes</p>
        </div>
        <button
          onClick={handleToggle}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            isComposition ? "bg-green-600" : "bg-gray-300"
          }`}
        >
          <div
            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              isComposition ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {isComposition && (
        <div className="px-4 py-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {[{ label: "Front 9", holes: Array.from({ length: 9 }, (_, i) => i + 1) }, { label: "Back 9", holes: Array.from({ length: 9 }, (_, i) => i + 10) }].map((col, colIdx) => (
              <div key={colIdx} className="space-y-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{col.label}</p>
                {col.holes.map((holeNum) => (
                  <div key={holeNum} className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 w-5 text-right">{holeNum}</span>
                    <select
                      value={mappings[holeNum] || ""}
                      onChange={(e) => updateHole(holeNum, e.target.value)}
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                    >
                      {eligibleTees.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.tee_name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {saving && (
            <p className="text-xs text-gray-400 text-center mt-2">Saving...</p>
          )}
        </div>
      )}
    </section>
  );
}
