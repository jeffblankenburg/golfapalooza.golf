"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatPhoneDisplay } from "@/lib/utils/phone";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { AccoladesList, type AccoladeData } from "@/components/profile/AccoladesList";

interface ProfileData {
  id: string;
  display_name: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  birthday: string | null;
  occupation: string | null;
  city: string | null;
  state: string | null;
  playing_since: number | null;
  swings: string | null;
  typical_shot: string | null;
  shirt_size: string | null;
  fun_fact: string | null;
  best_shot: string | null;
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

export function ProfileEditor({
  profile,
  accolades,
  handicapIndex,
  eightBagAverage,
  avgScrambleScore,
}: {
  profile: ProfileData;
  accolades: AccoladeData[];
  handicapIndex: number | null;
  eightBagAverage?: number | null;
  avgScrambleScore?: number | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const [error, setError] = useState("");
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    display_name: profile.display_name,
    full_name: profile.full_name || "",
    email: profile.email || "",
    birthday: profile.birthday || "",
    occupation: profile.occupation || "",
    city: profile.city || "",
    state: profile.state || "",
    playing_since: profile.playing_since?.toString() || "",
    swings: profile.swings || "",
    typical_shot: profile.typical_shot || "",
    shirt_size: profile.shirt_size || "",
    fun_fact: profile.fun_fact || "",
    best_shot: profile.best_shot || "",
  });

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveStatus("idle");
  };

  const handleAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    setError("");
    setPendingCropFile(file);
  };

  const handleCropConfirm = async (blob: Blob) => {
    setPendingCropFile(null);
    setUploading(true);
    try {
      const formData = new FormData();
      const ext = blob.type === "image/png" ? "png" : "jpg";
      formData.append("file", new File([blob], `avatar.${ext}`, { type: blob.type }));

      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to upload photo");
        return;
      }

      setAvatarUrl(`${data.avatar_url}?t=${Date.now()}`);
      router.refresh();
    } catch {
      setError("Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.display_name.trim()) {
      setError("Display name is required");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: saveError } = await supabase
        .from("users")
        .update({
          display_name: form.display_name.trim(),
          full_name: form.full_name.trim() || null,
          email: form.email.trim() || null,
          birthday: form.birthday || null,
          occupation: form.occupation.trim() || null,
          city: form.city.trim() || null,
          state: form.state || null,
          playing_since: form.playing_since
            ? parseInt(form.playing_since, 10)
            : null,
          swings: form.swings || null,
          typical_shot: form.typical_shot || null,
          shirt_size: form.shirt_size || null,
          fun_fact: form.fun_fact.trim() || null,
          best_shot: form.best_shot.trim() || null,
        })
        .eq("id", profile.id);

      if (saveError) {
        setError(saveError.message);
        return;
      }

      setSaveStatus("saved");
      router.refresh();
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setError("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="space-y-6">
      {/* Avatar + Handicap */}
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-24 h-24 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center disabled:opacity-50 active:opacity-80 transition-opacity"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={form.display_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-3xl font-bold">
                {getInitials(form.display_name)}
              </span>
            )}
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full">
                <div className="w-8 h-8 border-[3px] border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </button>
          {/* Camera badge — outside overflow-hidden */}
          {!uploading && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-8 h-8 bg-green-600 rounded-full flex items-center justify-center border-2 border-white cursor-pointer"
            >
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarPick}
          className="hidden"
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-gray-900 truncate">
            {form.display_name}
          </h2>
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-1.5">
              <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Handicap</span>
              <span className="text-sm font-bold text-blue-900">
                {handicapIndex !== null ? handicapIndex : "N/A"}
              </span>
            </div>
            {eightBagAverage != null && (
              <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5">
                <span className="text-xs font-medium text-emerald-600 uppercase tracking-wide">8 Bag Avg</span>
                <span className="text-sm font-bold text-emerald-900">{eightBagAverage}</span>
              </div>
            )}
            {avgScrambleScore != null && (
              <div className="inline-flex items-center gap-1.5 bg-purple-50 border border-purple-200 rounded-xl px-3 py-1.5">
                <span className="text-xs font-medium text-purple-600 uppercase tracking-wide">Avg Scramble</span>
                <span className="text-sm font-bold text-purple-900">{avgScrambleScore}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Accolades */}
      {accolades.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Accolades
          </h3>
          <AccoladesList accolades={accolades} profileUserId={profile.id} />
        </div>
      )}

      {/* Personal Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Personal Info
        </h3>

        <Field label="Display Name" required>
          <input
            type="text"
            value={form.display_name}
            onChange={(e) => updateField("display_name", e.target.value)}
            maxLength={100}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-[16px] text-gray-900 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
          />
        </Field>

        <Field label="Full Name">
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => updateField("full_name", e.target.value)}
            maxLength={100}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-[16px] text-gray-900 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            maxLength={255}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-[16px] text-gray-900 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
          />
        </Field>

        <Field label="Phone">
          <p className="px-4 py-3 text-[16px] text-gray-400">
            {formatPhoneDisplay(profile.phone)}
          </p>
        </Field>

        <Field label="Birthday">
          <input
            type="date"
            value={form.birthday}
            onChange={(e) => updateField("birthday", e.target.value)}
            style={{ backgroundColor: "transparent" }}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-[16px] text-gray-900 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
          />
        </Field>

        <Field label="Occupation">
          <input
            type="text"
            value={form.occupation}
            onChange={(e) => updateField("occupation", e.target.value)}
            maxLength={100}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-[16px] text-gray-900 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
          />
        </Field>

        <Field label="City">
          <input
            type="text"
            value={form.city}
            onChange={(e) => updateField("city", e.target.value)}
            maxLength={100}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-[16px] text-gray-900 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
          />
        </Field>

        <Field label="State">
          <select
            value={form.state}
            onChange={(e) => updateField("state", e.target.value)}
            style={{ backgroundColor: "transparent" }}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-[16px] text-gray-900 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
          >
            <option value="">Select state</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Golf Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Golf Info
        </h3>

        <Field label="Playing Since">
          <input
            type="number"
            value={form.playing_since}
            onChange={(e) => updateField("playing_since", e.target.value)}
            placeholder="e.g. 1995"
            min={1900}
            max={new Date().getFullYear()}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-[16px] text-gray-900 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
          />
        </Field>

        <Field label="Swings">
          <select
            value={form.swings}
            onChange={(e) => updateField("swings", e.target.value)}
            style={{ backgroundColor: "transparent" }}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-[16px] text-gray-900 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
          >
            <option value="">Select</option>
            <option value="right">Right</option>
            <option value="left">Left</option>
            <option value="both">Both</option>
          </select>
        </Field>

        <Field label="Typical Shot">
          <select
            value={form.typical_shot}
            onChange={(e) => updateField("typical_shot", e.target.value)}
            style={{ backgroundColor: "transparent" }}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-[16px] text-gray-900 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
          >
            <option value="">Select</option>
            <option value="straight">Straight</option>
            <option value="slice">Slice</option>
            <option value="hook">Hook</option>
            <option value="draw">Draw</option>
            <option value="fade">Fade</option>
          </select>
        </Field>

        <Field label="Shirt Size">
          <select
            value={form.shirt_size}
            onChange={(e) => updateField("shirt_size", e.target.value)}
            style={{ backgroundColor: "transparent" }}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-[16px] text-gray-900 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
          >
            <option value="">Select</option>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
            <option value="XL">XL</option>
            <option value="2XL">2XL</option>
            <option value="3XL">3XL</option>
            <option value="4XL">4XL</option>
          </select>
        </Field>
      </div>

      {/* About Me */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          About Me
        </h3>

        <Field label="Fun Fact">
          <textarea
            value={form.fun_fact}
            onChange={(e) => updateField("fun_fact", e.target.value)}
            placeholder="Something the other Loozers might not know about you"
            rows={3}
            style={{ backgroundColor: "transparent" }}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-[16px] text-gray-900 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 resize-none"
          />
        </Field>

        <Field label="Best Shot">
          <textarea
            value={form.best_shot}
            onChange={(e) => updateField("best_shot", e.target.value)}
            placeholder="Tell us about your greatest golf moment"
            rows={3}
            style={{ backgroundColor: "transparent" }}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-[16px] text-gray-900 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 resize-none"
          />
        </Field>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving || !form.display_name.trim()}
        className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold text-[15px] active:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {saving
          ? "Saving..."
          : saveStatus === "saved"
            ? "Saved!"
            : "Save Changes"}
      </button>

      {/* Sign Out */}
      <button
        onClick={handleSignOut}
        className="w-full py-3 rounded-xl font-semibold text-[15px] text-red-600 border border-red-200 active:bg-red-50 transition-colors"
      >
        Sign Out
      </button>

      {pendingCropFile && (
        <AvatarCropModal
          file={pendingCropFile}
          onCancel={() => setPendingCropFile(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-600 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
