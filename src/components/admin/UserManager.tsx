"use client";

import { useState, useEffect, useImperativeHandle, type Ref } from "react";
import { useRouter } from "next/navigation";
import { DragHandle } from "@/components/DragHandle";

interface User {
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

function formatPhone(phone: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) return phone;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function UserManager({ ref, onCountChange }: { ref?: Ref<{ openAdd: () => void }>; onCountChange?: (count: number) => void }) {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createData, setCreateData] = useState({
    phone: "",
    displayName: "",
    fullName: "",
    birthday: "",
    city: "",
    state: "",
  });
  const [creating, setCreating] = useState(false);

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

  const openAdd = () => {
    setCreateData({ phone: "", displayName: "", fullName: "", birthday: "", city: "", state: "" });
    setError("");
    setShowCreate(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createData),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create user");
        return;
      }
      setShowCreate(false);
      // Jump straight into the new user's detail page
      if (data.userId) {
        router.push(`/admin/users/${data.userId}`);
      } else {
        fetchUsers();
      }
    } catch {
      setError("Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleCreatePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numbers = e.target.value.replace(/\D/g, "");
    if (numbers.length <= 10) setCreateData({ ...createData, phone: formatPhone(numbers) });
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
      {error && !showCreate && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>
      )}

      <div className="mb-3">
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
        />
      </div>

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
              onClick={() => router.push(`/admin/users/${user.id}`)}
              className="w-full bg-white rounded-xl border border-gray-200 px-3 py-2.5 flex items-center gap-3 active:bg-gray-50 transition-colors text-left"
            >
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-gray-500">
                    {user.display_name?.[0]?.toUpperCase() || "?"}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{user.display_name}</p>
                {!user.is_system && (
                  <p className="text-xs text-gray-400 truncate">
                    {user.phone ? formatPhone(user.phone) : "No phone"}
                  </p>
                )}
              </div>
              {!user.is_system && user.is_financial_only && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 bg-amber-50 text-amber-700">$</span>
              )}
              {!user.is_system && user.handicap_index !== null && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 ${
                    user.handicap_source === "computed"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {user.handicap_index}
                </span>
              )}
              {user.is_system && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 bg-purple-100 text-purple-700">Bot</span>
              )}
              {!user.is_system && !user.is_financial_only && user.is_admin && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 bg-green-100 text-green-700">
                  Admin
                </span>
              )}
              <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}

        {users.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            <p className="text-sm">No Loozers yet. Add one to get started.</p>
          </div>
        )}
      </div>

      {/* Create modal — only handles new-user flow now */}
      {showCreate && (
        <div className="fixed top-14 bottom-16 left-0 right-0 z-35 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up max-h-[calc(100%-12px)] flex flex-col">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
              <DragHandle onClose={() => setShowCreate(false)} className="mb-4" />
              <h2 className="text-xl font-bold text-gray-900">New Loozer</h2>
              <p className="text-xs text-gray-500 mt-1">Create the basics — you can edit everything else after.</p>
            </div>

            <form id="create-user-form" onSubmit={handleCreate} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Phone Number
                  <span className="text-gray-400 font-normal ml-1">(leave blank for financial-only)</span>
                </label>
                <input
                  type="tel"
                  value={createData.phone}
                  onChange={handleCreatePhoneChange}
                  placeholder="(555) 123-4567"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-[16px]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Display Name</label>
                <input
                  type="text"
                  value={createData.displayName}
                  onChange={(e) => setCreateData({ ...createData, displayName: e.target.value })}
                  placeholder="Nickname"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-[16px]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Full Name (optional)</label>
                <input
                  type="text"
                  value={createData.fullName}
                  onChange={(e) => setCreateData({ ...createData, fullName: e.target.value })}
                  placeholder="John Smith"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-[16px]"
                />
              </div>
            </form>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <button
                type="submit"
                form="create-user-form"
                disabled={creating}
                className="flex-1 bg-green-600 text-white py-3 rounded-xl font-semibold text-[15px] disabled:bg-gray-300 active:bg-green-700"
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
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
