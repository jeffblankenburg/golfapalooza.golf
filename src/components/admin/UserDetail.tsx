"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PermissionsEditor } from "@/components/admin/PermissionsEditor";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { UserScorecardsTab } from "@/components/admin/user-tabs/UserScorecardsTab";
import { UserSongsTab } from "@/components/admin/user-tabs/UserSongsTab";
import { UserStatsTab } from "@/components/admin/user-tabs/UserStatsTab";

interface DetailUser {
  id: string;
  phone: string | null;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  is_active: boolean;
  is_financial_only: boolean;
  is_founder: boolean;
  is_system: boolean;
  sponsor_id: string | null;
  permissions: Record<string, boolean> | null;
  handicap_index: number | null;
  handicap_source: "manual" | "computed" | null;
  eight_bag_average: number | null;
  avg_scramble_score: number | null;
  birthday: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
}

interface MiniUser {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  sponsor_id: string | null;
  is_financial_only: boolean;
  is_system: boolean;
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

type Tab = "profile" | "scorecards" | "songs" | "stats" | "permissions";
const TABS: { key: Tab; label: string }[] = [
  { key: "profile", label: "Profile" },
  { key: "scorecards", label: "Scorecards" },
  { key: "songs", label: "Songs" },
  { key: "stats", label: "Stats" },
  { key: "permissions", label: "Permissions" },
];

function computeDescendants(rootId: string, users: MiniUser[]): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const u of users) {
    if (!u.sponsor_id) continue;
    if (!childrenByParent.has(u.sponsor_id)) childrenByParent.set(u.sponsor_id, []);
    childrenByParent.get(u.sponsor_id)!.push(u.id);
  }
  const descendants = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const child of childrenByParent.get(cur) || []) {
      if (!descendants.has(child)) {
        descendants.add(child);
        queue.push(child);
      }
    }
  }
  return descendants;
}

function formatPhone(phone: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) return phone;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function UserDetail({
  initialUser,
  allUsers,
}: {
  initialUser: DetailUser;
  allUsers: MiniUser[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab") as Tab | null;
  const isBot = initialUser.is_system;

  const [user, setUser] = useState<DetailUser>(initialUser);
  const [activeTab, setActiveTab] = useState<Tab>(
    tabFromUrl && TABS.some((t) => t.key === tabFromUrl) ? tabFromUrl : "profile"
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const [formData, setFormData] = useState({
    phone: user.phone ? formatPhone(user.phone) : "",
    displayName: user.display_name,
    fullName: user.full_name || "",
    handicapIndex: user.handicap_index !== null ? String(user.handicap_index) : "",
    eightBagAverage: user.eight_bag_average !== null ? String(user.eight_bag_average) : "",
    avgScrambleScore: user.avg_scramble_score !== null ? String(user.avg_scramble_score) : "",
    birthday: user.birthday || "",
    city: user.city || "",
    state: user.state || "",
  });
  const [editIsAdmin, setEditIsAdmin] = useState(user.is_admin);
  const [editPermissions, setEditPermissions] = useState<Record<string, boolean>>(user.permissions || {});
  const [editIsFounder, setEditIsFounder] = useState(user.is_founder);
  const [editSponsorId, setEditSponsorId] = useState<string | null>(user.sponsor_id);
  const [sponsorSearch, setSponsorSearch] = useState("");
  const [showSponsorPicker, setShowSponsorPicker] = useState(false);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar_url);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync tab to URL when it changes (without scroll-jumping)
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (activeTab === "profile") params.delete("tab");
    else params.set("tab", activeTab);
    const qs = params.toString();
    router.replace(`/admin/users/${user.id}${qs ? `?${qs}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (avatarInputRef.current) avatarInputRef.current.value = "";
    if (!file) return;
    setError("");
    setPendingCropFile(file);
  };

  const handleAvatarCropConfirm = async (blob: Blob) => {
    setPendingCropFile(null);
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      const ext = blob.type === "image/png" ? "png" : "jpg";
      form.append("file", new File([blob], `avatar.${ext}`, { type: blob.type }));
      const res = await fetch(`/api/admin/users/${user.id}/avatar`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to upload photo");
        return;
      }
      const busted = `${data.avatar_url}?t=${Date.now()}`;
      setAvatarPreview(busted);
      setUser({ ...user, avatar_url: busted });
    } catch {
      setError("Failed to upload photo");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numbers = e.target.value.replace(/\D/g, "");
    if (numbers.length <= 10) setFormData({ ...formData, phone: formatPhone(numbers) });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const body = {
        userId: user.id,
        ...formData,
        handicapIndex: formData.handicapIndex === "" ? null : formData.handicapIndex,
        eightBagAverage: formData.eightBagAverage === "" ? null : formData.eightBagAverage,
        avgScrambleScore: formData.avgScrambleScore === "" ? null : formData.avgScrambleScore,
        isAdmin: editIsAdmin,
        permissions: editIsAdmin ? {} : editPermissions,
        isFounder: editIsFounder,
        sponsorId: editIsFounder ? null : editSponsorId,
      };
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }
      // Patch local user state from formData so the title/avatar reflect changes.
      // Mirror the API's handicap source flip: changed value → 'manual', cleared
      // → null, unchanged → leave source as-is so a computed handicap stays
      // tagged COMPUTED when the admin saves without editing it.
      const newHandicap = formData.handicapIndex === "" ? null : parseFloat(formData.handicapIndex);
      const handicapChanged =
        newHandicap !== user.handicap_index &&
        !(newHandicap === null && user.handicap_index === null);
      let nextSource = user.handicap_source;
      if (newHandicap === null) nextSource = null;
      else if (handicapChanged) nextSource = "manual";
      setUser({
        ...user,
        display_name: formData.displayName,
        full_name: formData.fullName || null,
        phone: formData.phone ? formData.phone.replace(/\D/g, "") : null,
        is_admin: editIsAdmin,
        permissions: editIsAdmin ? {} : editPermissions,
        is_founder: editIsFounder,
        sponsor_id: editIsFounder ? null : editSponsorId,
        handicap_index: newHandicap,
        handicap_source: nextSource,
      });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1500);
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete");
        return;
      }
      router.push("/admin/users");
    } catch {
      setError("Failed to delete");
    }
  };

  const descendants = computeDescendants(user.id, allUsers);
  const eligibleSponsors = allUsers.filter(
    (u) => u.id !== user.id && !descendants.has(u.id) && !u.is_financial_only && !u.is_system
  );
  const q = sponsorSearch.toLowerCase().trim();
  const filteredSponsors = q
    ? eligibleSponsors.filter(
        (u) =>
          u.display_name.toLowerCase().includes(q) ||
          (u.full_name || "").toLowerCase().includes(q)
      )
    : eligibleSponsors;
  const currentSponsor = editSponsorId ? allUsers.find((u) => u.id === editSponsorId) : null;

  return (
    <div className="px-4 py-4 max-w-3xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => router.push("/admin/users")}
          className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center active:bg-gray-50 flex-shrink-0"
          aria-label="Back"
        >
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-900 flex-1 min-w-0 truncate">
          {user.display_name}
          {isBot && <span className="text-gray-400 font-normal text-sm ml-2">(Bot)</span>}
        </h1>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4 -mx-4 px-2 overflow-x-auto">
        <div className="flex gap-0.5 min-w-max">
          {TABS.map((t) => {
            const hideForBot = isBot && t.key !== "profile";
            if (hideForBot) return null;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === t.key
                    ? "text-green-700 border-green-600"
                    : "text-gray-400 border-transparent active:text-gray-600"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Profile tab */}
      {activeTab === "profile" && (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-4 mb-2">
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="w-20 h-20 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center disabled:opacity-50 active:opacity-80 transition-opacity"
              >
                {avatarPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold">
                    {(user.display_name?.[0] || "?").toUpperCase()}
                  </span>
                )}
                {uploadingAvatar && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full">
                    <div className="w-6 h-6 border-[3px] border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </button>
              {!uploadingAvatar && (
                <div
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-7 h-7 bg-green-600 rounded-full flex items-center justify-center border-2 border-white cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarPick}
              className="hidden"
            />
          </div>

          {!isBot && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Phone Number
                <span className="text-gray-400 font-normal ml-1">(leave blank for financial-only)</span>
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={handlePhoneChange}
                placeholder="(555) 123-4567"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Display Name</label>
            <input
              type="text"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              placeholder="Nickname"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base"
              required
            />
          </div>

          {!isBot && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Full Name (optional)</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="John Smith"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Birthday (optional)</label>
                <input
                  type="date"
                  value={formData.birthday}
                  onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                  style={{ backgroundColor: "transparent" }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base"
                />
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">City (optional)</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    maxLength={100}
                    placeholder="e.g. Columbus"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">State</label>
                  <select
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    style={{ backgroundColor: "transparent" }}
                    className="w-24 px-3 py-3 border border-gray-300 rounded-xl text-base"
                  >
                    <option value="">—</option>
                    {US_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-1">
                  <span>Handicap Index (optional)</span>
                  {user.handicap_source && user.handicap_index !== null && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[0.625rem] font-bold tracking-wide ${
                        user.handicap_source === "computed"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {user.handicap_source === "computed" ? "COMPUTED" : "MANUAL"}
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  max="54"
                  value={formData.handicapIndex}
                  onChange={(e) => setFormData({ ...formData, handicapIndex: e.target.value })}
                  placeholder="e.g. 12.4"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">8 Bag Avg</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={formData.eightBagAverage}
                    onChange={(e) => setFormData({ ...formData, eightBagAverage: e.target.value })}
                    placeholder="e.g. 82.5"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Avg Scramble</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={formData.avgScrambleScore}
                    onChange={(e) => setFormData({ ...formData, avgScrambleScore: e.target.value })}
                    placeholder="e.g. 72.3"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">Origin Story</h3>
                <button
                  type="button"
                  onClick={() => {
                    const next = !editIsFounder;
                    setEditIsFounder(next);
                    if (next) {
                      setEditSponsorId(null);
                      setShowSponsorPicker(false);
                    }
                  }}
                  className="flex items-center justify-between w-full py-1"
                >
                  <span className="text-sm text-gray-700">Founding Father</span>
                  <div
                    className={`w-11 h-6 rounded-full transition-colors relative ${
                      editIsFounder ? "bg-green-600" : "bg-gray-300"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        editIsFounder ? "translate-x-[22px]" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                </button>

                {!editIsFounder && (
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Sponsor</label>
                    {currentSponsor && !showSponsorPicker ? (
                      <button
                        type="button"
                        onClick={() => {
                          setShowSponsorPicker(true);
                          setSponsorSearch("");
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 border border-gray-300 rounded-xl bg-white text-left active:bg-gray-50"
                      >
                        {currentSponsor.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={currentSponsor.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-gray-500">
                              {currentSponsor.display_name?.[0]?.toUpperCase() || "?"}
                            </span>
                          </div>
                        )}
                        <span className="flex-1 text-sm text-gray-900">{currentSponsor.display_name}</span>
                        <span className="text-xs text-green-700 font-medium">Change</span>
                      </button>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={sponsorSearch}
                          onChange={(e) => {
                            setSponsorSearch(e.target.value);
                            setShowSponsorPicker(true);
                          }}
                          onFocus={() => setShowSponsorPicker(true)}
                          placeholder="Search Loozers…"
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base"
                        />
                        {showSponsorPicker && (
                          <div className="mt-2 max-h-56 overflow-y-auto border border-gray-200 rounded-xl bg-white">
                            {filteredSponsors.length === 0 && (
                              <div className="px-3 py-3 text-xs text-gray-400 text-center">No matches</div>
                            )}
                            {filteredSponsors.map((u) => (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => {
                                  setEditSponsorId(u.id);
                                  setShowSponsorPicker(false);
                                  setSponsorSearch("");
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2 text-left active:bg-gray-50"
                              >
                                {u.avatar_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={u.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[0.625rem] font-semibold text-gray-500">
                                      {u.display_name?.[0]?.toUpperCase() || "?"}
                                    </span>
                                  </div>
                                )}
                                <span className="text-sm text-gray-900">{u.display_name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-green-600 text-white py-3 rounded-xl font-semibold text-[0.9375rem] disabled:bg-gray-300 active:bg-green-700"
            >
              {saving ? "Saving..." : savedFlash ? "Saved ✓" : "Save"}
            </button>
            {!isBot && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
                className="px-4 py-3 text-sm font-semibold text-red-600 border border-red-200 rounded-xl active:bg-red-50 disabled:opacity-50"
              >
                Delete
              </button>
            )}
          </div>
        </form>
      )}

      {/* Permissions tab */}
      {activeTab === "permissions" && !isBot && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave(e);
          }}
          className="space-y-4"
        >
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setEditIsAdmin(!editIsAdmin)}
              className="flex items-center justify-between w-full py-1"
            >
              <span className="text-sm font-semibold text-gray-700">Admin Access</span>
              <div
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  editIsAdmin ? "bg-green-600" : "bg-gray-300"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    editIsAdmin ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </div>
            </button>
            {!editIsAdmin && (
              <PermissionsEditor permissions={editPermissions} onChange={setEditPermissions} />
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold text-[0.9375rem] disabled:bg-gray-300 active:bg-green-700"
          >
            {saving ? "Saving..." : savedFlash ? "Saved ✓" : "Save Permissions"}
          </button>
        </form>
      )}

      {activeTab === "scorecards" && !isBot && <UserScorecardsTab userId={user.id} />}
      {activeTab === "songs" && !isBot && <UserSongsTab userId={user.id} />}
      {activeTab === "stats" && !isBot && <UserStatsTab userId={user.id} />}

      <ConfirmModal
        open={confirmDelete}
        title="Delete Loozer"
        message={`This will permanently delete ${user.display_name}. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      {pendingCropFile && (
        <AvatarCropModal
          file={pendingCropFile}
          onCancel={() => setPendingCropFile(null)}
          onConfirm={handleAvatarCropConfirm}
        />
      )}
    </div>
  );
}
