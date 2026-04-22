"use client";

import { useState, useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { PermissionsEditor } from "@/components/admin/PermissionsEditor";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { AvatarCropModal } from "@/components/AvatarCropModal";

interface User {
  id: string;
  phone: string | null;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  is_active: boolean;
  is_financial_only: boolean;
  permissions: Record<string, boolean> | null;
  handicap_index: number | null;
  eight_bag_average: number | null;
  avg_scramble_score: number | null;
  birthday: string | null;
  created_at: string;
}

function formatPhone(phone: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) return phone;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function UserManager({ ref, onCountChange }: { ref?: Ref<{ openAdd: () => void }>; onCountChange?: (count: number) => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    phone: "",
    displayName: "",
    fullName: "",
    handicapIndex: "",
    eightBagAverage: "",
    avgScrambleScore: "",
    birthday: "",
  });
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [editPermissions, setEditPermissions] = useState<
    Record<string, boolean>
  >({});
  const [saving, setSaving] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({ openAdd }));

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load users");
        return;
      }
      setUsers(data.users);
      onCountChange?.(data.users.length);
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const url = "/api/admin/users";
      const method = editingUser ? "PUT" : "POST";
      const body = editingUser
        ? {
            userId: editingUser.id,
            ...formData,
            handicapIndex: formData.handicapIndex === "" ? null : formData.handicapIndex,
            eightBagAverage: formData.eightBagAverage === "" ? null : formData.eightBagAverage,
            avgScrambleScore: formData.avgScrambleScore === "" ? null : formData.avgScrambleScore,
            isAdmin: editIsAdmin,
            permissions: editIsAdmin ? {} : editPermissions,
          }
        : {
            ...formData,
            handicapIndex: formData.handicapIndex === "" ? null : formData.handicapIndex,
            eightBagAverage: formData.eightBagAverage === "" ? null : formData.eightBagAverage,
            avgScrambleScore: formData.avgScrambleScore === "" ? null : formData.avgScrambleScore,
          };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save user");
        return;
      }

      closeModal();
      fetchUsers();
    } catch {
      setError("Failed to save user");
    } finally {
      setSaving(false);
    }
  };

  const openAdd = () => {
    setEditingUser(null);
    setFormData({ phone: "", displayName: "", fullName: "", handicapIndex: "", eightBagAverage: "", avgScrambleScore: "", birthday: "" });
    setEditIsAdmin(false);
    setEditPermissions({});
    setError("");
    setShowModal(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      phone: user.phone ? formatPhone(user.phone) : "",
      displayName: user.display_name,
      fullName: user.full_name || "",
      handicapIndex: user.handicap_index !== null ? String(user.handicap_index) : "",
      eightBagAverage: user.eight_bag_average !== null ? String(user.eight_bag_average) : "",
      avgScrambleScore: user.avg_scramble_score !== null ? String(user.avg_scramble_score) : "",
      birthday: user.birthday || "",
    });
    setEditIsAdmin(user.is_admin);
    setEditPermissions(user.permissions || {});
    setAvatarPreview(user.avatar_url);
    setError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setAvatarPreview(null);
    setPendingCropFile(null);
    setError("");
  };

  const handleAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (avatarInputRef.current) avatarInputRef.current.value = "";
    if (!file) return;
    setError("");
    setPendingCropFile(file);
  };

  const handleAvatarCropConfirm = async (blob: Blob) => {
    if (!editingUser) return;
    setPendingCropFile(null);
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      const ext = blob.type === "image/png" ? "png" : "jpg";
      formData.append("file", new File([blob], `avatar.${ext}`, { type: blob.type }));

      const res = await fetch(`/api/admin/users/${editingUser.id}/avatar`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to upload photo");
        return;
      }

      const busted = `${data.avatar_url}?t=${Date.now()}`;
      setAvatarPreview(busted);
      setEditingUser({ ...editingUser, avatar_url: busted });
      setUsers((prev) =>
        prev.map((u) => (u.id === editingUser.id ? { ...u, avatar_url: busted } : u))
      );
    } catch {
      setError("Failed to upload photo");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleDelete = (user: User) => {
    setConfirmModal({
      title: "Delete Loozer",
      message: `This will permanently delete ${user.display_name}. This cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await fetch("/api/admin/users", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || "Failed to delete user");
            return;
          }
          fetchUsers();
        } catch {
          setError("Failed to delete user");
        }
      },
    });
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numbers = e.target.value.replace(/\D/g, "");
    if (numbers.length <= 10) {
      setFormData({ ...formData, phone: formatPhone(numbers) });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {error && !showModal && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
        />
      </div>

      {/* User list */}
      <div className="space-y-2">
        {users
          .filter((u) => {
            if (!search) return true;
            const q = search.toLowerCase();
            const digits = q.replace(/\D/g, "");
            return (
              u.display_name.toLowerCase().includes(q) ||
              (u.full_name || "").toLowerCase().includes(q) ||
              (digits.length > 0 && (u.phone || "").includes(digits))
            );
          })
          .map((user) => (
          <button
            key={user.id}
            onClick={() => openEdit(user)}
            className="w-full bg-white rounded-xl border border-gray-200 px-3 py-2.5 flex items-center gap-3 active:bg-gray-50 transition-colors text-left"
          >
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt=""
                className="w-9 h-9 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-gray-500">
                  {user.display_name?.[0]?.toUpperCase() || "?"}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">
                {user.display_name}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {user.phone ? formatPhone(user.phone) : "No phone"}
              </p>
            </div>
            {user.is_financial_only && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 bg-amber-50 text-amber-700">
                $
              </span>
            )}
            {user.handicap_index !== null && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 bg-blue-50 text-blue-700">
                {user.handicap_index}
              </span>
            )}
            {!user.is_financial_only && (
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 ${
                  user.is_admin
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {user.is_admin ? "Admin" : "User"}
              </span>
            )}
            <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}

        {users.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            <p className="text-sm">
              No Loozers yet. Add one to get started.
            </p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed top-14 bottom-16 left-0 right-0 z-35 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeModal}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up max-h-[calc(100%-12px)] flex flex-col">
            {/* Header */}
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900">
                {editingUser ? `Edit '${editingUser.display_name}'` : "New Loozer"}
              </h2>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">
                  {error}
                </div>
              )}

              {editingUser && (
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="w-20 h-20 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center disabled:opacity-50 active:opacity-80 transition-opacity"
                    >
                      {avatarPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarPreview}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-2xl font-bold">
                          {(editingUser.display_name?.[0] || "?").toUpperCase()}
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
              )}

              <form
                id="user-form"
                onSubmit={handleSubmit}
                className="space-y-4"
              >
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-[16px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) =>
                      setFormData({ ...formData, displayName: e.target.value })
                    }
                    placeholder="Nickname"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-[16px]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Full Name (optional)
                  </label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) =>
                      setFormData({ ...formData, fullName: e.target.value })
                    }
                    placeholder="John Smith"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-[16px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Birthday (optional)
                  </label>
                  <input
                    type="date"
                    value={formData.birthday}
                    onChange={(e) =>
                      setFormData({ ...formData, birthday: e.target.value })
                    }
                    style={{ backgroundColor: "transparent" }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-[16px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Handicap Index (optional)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    max="54"
                    value={formData.handicapIndex}
                    onChange={(e) =>
                      setFormData({ ...formData, handicapIndex: e.target.value })
                    }
                    placeholder="e.g. 12.4"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-[16px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      8 Bag Avg
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      value={formData.eightBagAverage}
                      onChange={(e) =>
                        setFormData({ ...formData, eightBagAverage: e.target.value })
                      }
                      placeholder="e.g. 82.5"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-[16px]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Avg Scramble
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      value={formData.avgScrambleScore}
                      onChange={(e) =>
                        setFormData({ ...formData, avgScrambleScore: e.target.value })
                      }
                      placeholder="e.g. 72.3"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-[16px]"
                    />
                  </div>
                </div>

                {editingUser && (
                  <div className="pt-3 border-t border-gray-100 space-y-3">
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
                      <PermissionsEditor
                        permissions={editPermissions}
                        onChange={setEditPermissions}
                      />
                    )}
                  </div>
                )}
              </form>
            </div>

            {/* Fixed footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <button
                type="submit"
                form="user-form"
                disabled={saving}
                className="flex-1 bg-green-600 text-white py-3 rounded-xl font-semibold text-[15px] disabled:bg-gray-300 active:bg-green-700"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 py-3 border border-gray-300 rounded-xl font-semibold text-[15px] text-gray-600 active:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
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
