"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ProfileData {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  playing_since: number | null;
  swings: string | null;
  typical_shot: string | null;
  fun_fact: string | null;
  best_shot: string | null;
  occupation: string | null;
}

interface AccoladeData {
  id: string;
  title: string;
  trip: { trip_year: number }[] | { trip_year: number } | null;
}

interface TaggedPhoto {
  id: string;
  media_url: string;
  thumbnail_url: string | null;
  media_type: string;
  created_at: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export function LoozerProfile({
  userId,
  isOwnProfile,
}: {
  userId: string;
  isOwnProfile: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [accolades, setAccolades] = useState<AccoladeData[]>([]);
  const [taggedPhotos, setTaggedPhotos] = useState<TaggedPhoto[]>([]);
  const [handicapIndex, setHandicapIndex] = useState<number | null>(null);
  const [eightBagAverage, setEightBagAverage] = useState<number | null>(null);
  const [avgScrambleScore, setAvgScrambleScore] = useState<number | null>(null);
  const [startingChat, setStartingChat] = useState(false);

  useEffect(() => {
    fetch(`/api/loozers/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        setProfile(data.profile);
        setAccolades(data.accolades || []);
        setTaggedPhotos(data.taggedPhotos || []);
        setHandicapIndex(data.handicapIndex ?? null);
        setEightBagAverage(data.eightBagAverage ?? null);
        setAvgScrambleScore(data.avgScrambleScore ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-lg font-medium">Loozer not found</p>
      </div>
    );
  }

  const location = [profile.city, profile.state].filter(Boolean).join(", ");

  const openChat = async () => {
    setStartingChat(true);
    try {
      const res = await fetch("/api/chat/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [userId] }),
      });
      const data = await res.json();
      if (data.room?.id) {
        router.push(`/chat/${data.room.id}`);
      }
    } catch {
      // ignore
    }
    setStartingChat(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col items-center">
        <div className="w-24 h-24 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.display_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-3xl font-bold">
              {getInitials(profile.display_name)}
            </span>
          )}
        </div>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">
          {profile.display_name}
        </h1>
        {profile.full_name && profile.full_name !== profile.display_name && (
          <p className="text-sm text-gray-500">{profile.full_name}</p>
        )}
        {location && (
          <p className="text-sm text-gray-500 mt-0.5">{location}</p>
        )}
        {profile.phone && (
          <a
            href={`tel:+1${profile.phone.replace(/\D/g, "")}`}
            className="text-sm text-gray-500 mt-0.5 flex items-center gap-1 hover:text-green-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            {formatPhone(profile.phone)}
          </a>
        )}

        {/* Stats badges */}
        {(handicapIndex != null || eightBagAverage != null || avgScrambleScore != null) && (
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
            {handicapIndex != null && (
              <div className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-1.5">
                <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Handicap</span>
                <span className="text-sm font-bold text-blue-900">{handicapIndex}</span>
              </div>
            )}
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
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3 mt-3">
          {isOwnProfile ? (
            <Link
              href="/profile"
              className="text-sm font-medium text-green-600"
            >
              Edit Profile
            </Link>
          ) : (
            <button
              onClick={openChat}
              disabled={startingChat}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl active:bg-green-700 transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {startingChat ? "Opening..." : "Message"}
            </button>
          )}
        </div>
      </div>

      {/* Accolades */}
      {accolades.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Accolades
          </h3>
          <div className="space-y-2">
            {accolades.map((a) => {
              const trip = Array.isArray(a.trip) ? a.trip[0] : a.trip;
              return (
                <div key={a.id} className="flex items-center gap-2">
                  <span className="text-amber-500">&#127942;</span>
                  <span className="text-sm font-medium text-gray-900">
                    {a.title}
                  </span>
                  {trip?.trip_year && (
                    <span className="text-xs text-gray-400">
                      ({trip.trip_year})
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* About */}
      {(profile.occupation ||
        profile.fun_fact ||
        profile.best_shot ||
        profile.playing_since ||
        profile.swings ||
        profile.typical_shot) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            About
          </h3>
          <div className="space-y-3">
            {profile.occupation && (
              <InfoRow label="Occupation" value={profile.occupation} />
            )}
            {profile.playing_since && (
              <InfoRow
                label="Playing Since"
                value={String(profile.playing_since)}
              />
            )}
            {profile.swings && (
              <InfoRow
                label="Swings"
                value={
                  profile.swings.charAt(0).toUpperCase() +
                  profile.swings.slice(1)
                }
              />
            )}
            {profile.typical_shot && (
              <InfoRow
                label="Typical Shot"
                value={
                  profile.typical_shot.charAt(0).toUpperCase() +
                  profile.typical_shot.slice(1)
                }
              />
            )}
            {profile.fun_fact && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-0.5">
                  Fun Fact
                </p>
                <p className="text-sm text-gray-900">{profile.fun_fact}</p>
              </div>
            )}
            {profile.best_shot && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-0.5">
                  Best Shot
                </p>
                <p className="text-sm text-gray-900">{profile.best_shot}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tagged Photos */}
      {taggedPhotos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Tagged Photos
            </h3>
            <Link
              href={`/gallery?tagged=${userId}`}
              className="text-xs font-medium text-green-600"
            >
              See All
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {taggedPhotos.map((photo) => (
              <div
                key={photo.id}
                className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-100"
              >
                <img
                  src={photo.thumbnail_url || photo.media_url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Standings - Coming Soon */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Current Standings
        </h3>
        <p className="text-sm text-gray-400 italic">Coming soon</p>
      </div>

      {/* Scorecards - Coming Soon */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Scorecards
        </h3>
        <p className="text-sm text-gray-400 italic">Coming soon</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className="text-sm text-gray-900">{value}</span>
    </div>
  );
}
