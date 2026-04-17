"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import { useMusicPlayer, Song } from "@/contexts/MusicPlayerContext";

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

interface SongData {
  id: string;
  title: string;
  mp3_url: string;
  art_url: string | null;
}

interface ScorecardSummary {
  roundId: string;
  roundDate: string;
  roundType: string;
  courseName: string;
  score: number;
  par: number;
  scoreToPar: number;
  differential: number | null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

export function LoozerProfile({
  userId,
  isOwnProfile,
}: {
  userId: string;
  isOwnProfile: boolean;
}) {
  const router = useRouter();
  const musicPlayer = useMusicPlayer();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [accolades, setAccolades] = useState<AccoladeData[]>([]);
  const [taggedPhotos, setTaggedPhotos] = useState<TaggedPhoto[]>([]);
  const [taggedPhotosCount, setTaggedPhotosCount] = useState(0);
  const [handicapIndex, setHandicapIndex] = useState<number | null>(null);
  const [eightBagAverage, setEightBagAverage] = useState<number | null>(null);
  const [avgScrambleScore, setAvgScrambleScore] = useState<number | null>(null);
  const [bio, setBio] = useState<{ content: string } | null>(null);
  const [song, setSong] = useState<SongData | null>(null);
  const [scorecards, setScorecards] = useState<ScorecardSummary[]>([]);
  const [startingChat, setStartingChat] = useState(false);

  // Accordion state — bio open by default, others closed
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["bio"]));

  useEffect(() => {
    fetch(`/api/loozers/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        setProfile(data.profile);
        setAccolades(data.accolades || []);
        setTaggedPhotos(data.taggedPhotos || []);
        setTaggedPhotosCount(data.taggedPhotosCount ?? 0);
        setHandicapIndex(data.handicapIndex ?? null);
        setEightBagAverage(data.eightBagAverage ?? null);
        setAvgScrambleScore(data.avgScrambleScore ?? null);
        setBio(data.bio ?? null);
        setSong(data.song ?? null);
        setScorecards(data.scorecards || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userId]);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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

  const playSong = () => {
    if (!song) return;
    const songObj: Song = {
      id: song.id,
      title: song.title,
      mp3_url: song.mp3_url,
      art_url: song.art_url,
      art_thumb_url: null,
      lyrics: null,
      duration_seconds: null,
      sort_order: 0,
      tagged_user: profile ? { id: profile.id, display_name: profile.display_name, avatar_url: profile.avatar_url } : null,
      is_favorite: false,
    };
    musicPlayer.loadSongs([songObj]);
    musicPlayer.play(0);
  };

  const phoneDigits = profile.phone?.replace(/\D/g, "") || "";

  return (
    <div className="space-y-4">
      {/* ── Compact Header ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center flex-shrink-0">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.display_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold">
                {getInitials(profile.display_name)}
              </span>
            )}
          </div>

          {/* Name + stats */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">
              {profile.display_name}
            </h1>
            {profile.full_name && profile.full_name !== profile.display_name && (
              <p className="text-sm text-gray-500 truncate">{profile.full_name}</p>
            )}
            {handicapIndex != null && (
              <span className="inline-flex items-center gap-1 mt-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-0.5">
                Handicap: {handicapIndex}
              </span>
            )}
          </div>

          {/* 2x2 comms grid */}
          <div className="grid grid-cols-2 gap-1.5 flex-shrink-0">
            {profile.phone && (
              <a
                href={`tel:+1${phoneDigits}`}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-green-50 text-green-700 active:bg-green-100 transition-colors"
                title="Call"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </a>
            )}
            {profile.phone && (
              <a
                href={`sms:+1${phoneDigits}`}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-blue-700 active:bg-blue-100 transition-colors"
                title="Text"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              </a>
            )}
            {!isOwnProfile && (
              <button
                onClick={openChat}
                disabled={startingChat}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-50 text-purple-700 active:bg-purple-100 transition-colors disabled:opacity-50"
                title="Message in app"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </button>
            )}
            {song && (
              <button
                onClick={playSong}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-50 text-amber-700 active:bg-amber-100 transition-colors"
                title={`Play: ${song.title}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </button>
            )}
            {isOwnProfile && (
              <Link
                href="/profile"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-50 text-gray-700 active:bg-gray-100 transition-colors"
                title="Edit Profile"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Accordion Sections ── */}

      {/* Bio — only shown if bio exists */}
      {bio && bio.content && (
        <Accordion
          title="Biography"
          isOpen={openSections.has("bio")}
          onToggle={() => toggleSection("bio")}
        >
          <div className="prose prose-sm max-w-none text-gray-700">
            <ReactMarkdown
              remarkPlugins={[remarkBreaks]}
              rehypePlugins={[rehypeRaw]}
              components={{
                a: ({ href, children }) => {
                  if (href?.startsWith("/")) {
                    return (
                      <Link href={href} className="text-green-700 underline font-medium">
                        {children}
                      </Link>
                    );
                  }
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-green-700 underline font-medium">
                      {children}
                    </a>
                  );
                },
              }}
            >
              {bio.content}
            </ReactMarkdown>
          </div>
        </Accordion>
      )}

      {/* Tagged Photos */}
      <Accordion
        title="Tagged Photos"
        count={taggedPhotosCount}
        isOpen={openSections.has("photos")}
        onToggle={() => toggleSection("photos")}
      >
        {taggedPhotos.length > 0 ? (
          <>
            <div className="grid grid-cols-4 gap-2">
              {taggedPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="aspect-square rounded-lg overflow-hidden bg-gray-100"
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
            <Link
              href={`/gallery?tagged=${userId}`}
              className="block text-center text-xs font-medium text-green-600 mt-2"
            >
              See All Photos
            </Link>
          </>
        ) : (
          <p className="text-sm text-gray-400 italic">No tagged photos yet</p>
        )}
      </Accordion>

      {/* Scorecards */}
      <Accordion
        title="Scorecards"
        count={scorecards.length}
        isOpen={openSections.has("scorecards")}
        onToggle={() => toggleSection("scorecards")}
      >
        {scorecards.length > 0 ? (
          <div className="space-y-2">
            {scorecards.map((sc) => {
              const toParStr = sc.scoreToPar === 0 ? "E" : sc.scoreToPar > 0 ? `+${sc.scoreToPar}` : `${sc.scoreToPar}`;
              const dateStr = (() => {
                const [y, m, d] = sc.roundDate.split("-").map(Number);
                return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              })();
              return (
                <Link
                  key={sc.roundId}
                  href={`/my-rounds/rounds/${sc.roundId}`}
                  className="block bg-gray-50 rounded-lg p-3 active:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-gray-900">{sc.courseName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">{sc.score}</span>
                      <span className={`text-xs font-medium ${sc.scoreToPar < 0 ? "text-green-600" : sc.scoreToPar > 0 ? "text-red-600" : "text-gray-500"}`}>
                        ({toParStr})
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">{dateStr}</p>
                    {sc.differential != null && (
                      <span className="text-xs text-gray-400 shrink-0">Diff {sc.differential}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">No scorecards yet</p>
        )}
      </Accordion>

      {/* Current Standings */}
      <Accordion
        title="Current Standings"
        isOpen={openSections.has("standings")}
        onToggle={() => toggleSection("standings")}
      >
        {/* Stats badges */}
        {(eightBagAverage != null || avgScrambleScore != null) ? (
          <div className="flex flex-wrap gap-2">
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
        ) : (
          <p className="text-sm text-gray-400 italic">Coming soon</p>
        )}
      </Accordion>

      {/* Accolades (bonus section, not in required spec but already exists) */}
      {accolades.length > 0 && (
        <Accordion
          title="Accolades"
          count={accolades.length}
          isOpen={openSections.has("accolades")}
          onToggle={() => toggleSection("accolades")}
        >
          <div className="space-y-2">
            {accolades.map((a) => {
              const trip = Array.isArray(a.trip) ? a.trip[0] : a.trip;
              return (
                <div key={a.id} className="flex items-center gap-2">
                  <span className="text-amber-500">&#127942;</span>
                  <span className="text-sm font-medium text-gray-900">{a.title}</span>
                  {trip?.trip_year && (
                    <span className="text-xs text-gray-400">({trip.trip_year})</span>
                  )}
                </div>
              );
            })}
          </div>
        </Accordion>
      )}

      {/* About (bonus section) */}
      {(profile.occupation || profile.fun_fact || profile.best_shot || profile.playing_since || profile.swings || profile.typical_shot) && (
        <Accordion
          title="About"
          isOpen={openSections.has("about")}
          onToggle={() => toggleSection("about")}
        >
          <div className="space-y-3">
            {profile.occupation && <InfoRow label="Occupation" value={profile.occupation} />}
            {profile.playing_since && <InfoRow label="Playing Since" value={String(profile.playing_since)} />}
            {profile.swings && <InfoRow label="Swings" value={profile.swings.charAt(0).toUpperCase() + profile.swings.slice(1)} />}
            {profile.typical_shot && <InfoRow label="Typical Shot" value={profile.typical_shot.charAt(0).toUpperCase() + profile.typical_shot.slice(1)} />}
            {profile.fun_fact && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-0.5">Fun Fact</p>
                <p className="text-sm text-gray-900">{profile.fun_fact}</p>
              </div>
            )}
            {profile.best_shot && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-0.5">Best Shot</p>
                <p className="text-sm text-gray-900">{profile.best_shot}</p>
              </div>
            )}
          </div>
        </Accordion>
      )}
    </div>
  );
}

function Accordion({
  title,
  count,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50 transition-colors"
      >
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          {title}
          {count != null && count > 0 && (
            <span className="ml-1.5 text-xs font-normal text-gray-400">({count})</span>
          )}
        </h3>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        ref={contentRef}
        className={`overflow-hidden transition-all duration-200 ${isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="px-4 pb-4">{children}</div>
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
