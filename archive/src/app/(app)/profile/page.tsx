"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPhoneDisplay } from "@/lib/utils/phone";

interface UserProfile {
  id: string;
  display_name: string;
  full_name: string | null;
  email: string | null;
  phone: string;
  is_admin: boolean;
}

interface UserStats {
  totalRounds: number;
  handicapIndex: number | null;
  bestRound: number | null;
  averageScore: number | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "stats">("stats");

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch profile
        const profileRes = await fetch("/api/me");
        const profileData = await profileRes.json();

        if (!profileRes.ok) {
          throw new Error(profileData.error || "Failed to fetch profile");
        }

        setProfile(profileData.user);
        setDisplayName(profileData.user.display_name || "");
        setFullName(profileData.user.full_name || "");
        setEmail(profileData.user.email || "");

        // Fetch stats (handicap and rounds)
        const [handicapRes, roundsRes] = await Promise.all([
          fetch("/api/handicap"),
          fetch("/api/rounds?limit=100"),
        ]);

        const handicapData = await handicapRes.json();
        const roundsData = await roundsRes.json();

        const completedRounds = (roundsData.rounds || []).filter(
          (r: { status: string }) => r.status === "completed"
        );

        // Calculate stats
        let bestRound: number | null = null;
        let totalScore = 0;
        let scoredRounds = 0;

        for (const round of completedRounds) {
          if (round.players?.[0]?.final_gross_score) {
            const score = round.players[0].final_gross_score;
            totalScore += score;
            scoredRounds++;
            if (bestRound === null || score < bestRound) {
              bestRound = score;
            }
          }
        }

        setStats({
          totalRounds: completedRounds.length,
          handicapIndex: handicapData.handicap?.handicap_index ?? null,
          bestRound,
          averageScore: scoredRounds > 0 ? Math.round(totalScore / scoredRounds) : null,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim(),
          full_name: fullName.trim() || null,
          email: email.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update profile");
      }

      setProfile(data.user);
      setSuccess("Profile updated successfully!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      router.push("/login");
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-3 border-green-500 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
          <span className="text-3xl font-bold text-green-700">
            {profile?.display_name?.charAt(0).toUpperCase() || "?"}
          </span>
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {profile?.display_name}
          </h1>
          <p className="text-sm text-gray-500">
            {formatPhoneDisplay(profile?.phone)}
          </p>
          {profile?.is_admin && (
            <span className="inline-block mt-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
              Admin
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4 text-green-700">
          {success}
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        <Link href="/rounds" className="bg-white rounded-lg border border-gray-200 p-3 text-center hover:border-green-300 transition-colors">
          <div className="text-2xl font-bold text-gray-900">{stats?.totalRounds ?? 0}</div>
          <div className="text-xs text-gray-500">Rounds</div>
        </Link>
        <Link href="/handicap" className="bg-white rounded-lg border border-gray-200 p-3 text-center hover:border-green-300 transition-colors">
          <div className="text-2xl font-bold text-gray-900">
            {stats?.handicapIndex?.toFixed(1) ?? "—"}
          </div>
          <div className="text-xs text-gray-500">Handicap</div>
        </Link>
        <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">{stats?.bestRound ?? "—"}</div>
          <div className="text-xs text-gray-500">Best</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">{stats?.averageScore ?? "—"}</div>
          <div className="text-xs text-gray-500">Average</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "profile"
              ? "bg-white text-green-700 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Edit Profile
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("stats")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "stats"
              ? "bg-white text-green-700 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          My Data
        </button>
      </div>

      {activeTab === "profile" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                Display Name *
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                maxLength={100}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-900"
                placeholder="How others will see you"
              />
              <p className="mt-1 text-xs text-gray-500">
                Shown in rounds, leaderboards, and to other players
              </p>
            </div>

            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={100}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-900"
                placeholder="Your full name (optional)"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-900"
                placeholder="your@email.com (optional)"
              />
              <p className="mt-1 text-xs text-gray-500">
                For notifications and account recovery
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                value={formatPhoneDisplay(profile?.phone)}
                disabled
                className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-gray-500">
                Contact an admin to change your phone number
              </p>
            </div>

            <button
              type="submit"
              disabled={isSaving || !displayName.trim()}
              className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-medium rounded-lg flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </form>
        </div>
      )}

      {activeTab === "stats" && (
        <div className="space-y-4">
          {/* Rounds Link */}
          <Link
            href="/rounds"
            className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-green-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-gray-900">My Rounds</div>
                  <div className="text-sm text-gray-500">{stats?.totalRounds ?? 0} rounds played</div>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>

          {/* Handicap Link */}
          <Link
            href="/handicap"
            className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-green-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-gray-900">My Handicap</div>
                  <div className="text-sm text-gray-500">
                    {stats?.handicapIndex !== null
                      ? `Current index: ${stats.handicapIndex.toFixed(1)}`
                      : "Not enough rounds yet"}
                  </div>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>

          {/* Friends - Coming Soon */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-gray-900">Friends</div>
                  <div className="text-sm text-gray-500">Coming soon</div>
                </div>
              </div>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">Soon</span>
            </div>
          </div>

          {/* Admin Link */}
          {profile?.is_admin && (
            <Link
              href="/admin/users"
              className="block bg-white rounded-xl border border-purple-200 p-4 hover:border-purple-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Admin Panel</div>
                    <div className="text-sm text-gray-500">Manage users and settings</div>
                  </div>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* Sign Out */}
      <button
        type="button"
        onClick={handleSignOut}
        className="w-full mt-6 py-3 border border-red-300 text-red-600 hover:bg-red-50 font-medium rounded-lg"
      >
        Sign Out
      </button>
    </div>
  );
}
