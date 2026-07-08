"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import { useMusicPlayerOptional, Song } from "@/contexts/MusicPlayerContext";
import { FakeAdCarousel } from "@/components/FakeAdCarousel";
import { AccoladesList, type AccoladeData } from "@/components/profile/AccoladesList";
import { LoozerTree } from "@/components/LoozerTree";
import { AvatarLightbox } from "@/components/AvatarLightbox";
import { FavoriteStarButton } from "@/components/favorites/FavoriteStarButton";
import { BTN_PRIMARY } from "@/lib/ui/buttons";

interface DescendantLoozer {
  id: string;
  display_name: string;
  full_name?: string | null;
  avatar_url: string | null;
  sponsor_id: string | null;
  is_founder: boolean;
}

interface ProfileData {
  id: string;
  display_name: string;
  full_name?: string | null;
  avatar_url: string | null;
  phone?: string | null;
  city: string | null;
  state: string | null;
  playing_since: number | null;
  swings: string | null;
  typical_shot: string | null;
  fun_fact: string | null;
  best_shot: string | null;
  occupation: string | null;
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
  roundId?: string;
  roundDate: string;
  roundType: string;
  courseName: string;
  score: number;
  par: number;
  scoreToPar: number;
  differential: number | null;
}

interface SponsorRef {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface LoozerProfileData {
  profile: ProfileData;
  accolades: AccoladeData[];
  taggedPhotos: TaggedPhoto[];
  taggedPhotosCount: number;
  handicapIndex: number | null;
  eightBagAverage: number | null;
  avgScrambleScore: number | null;
  bio: { content: string } | null;
  song?: SongData | null;
  scorecards: ScorecardSummary[];
  isFounder?: boolean;
  sponsor?: SponsorRef | null;
  eventsAttended?: number;
  currentRoomNumber?: string | null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

/**
 * Unified Loozer profile component.
 * - When `data` is provided, renders immediately (server-fetched, used by spectator pages).
 * - When `data` is omitted, fetches from `/api/loozers/{userId}` client-side (authenticated pages).
 * - When `spectator` is true, hides private info (phone, chat, song, full_name, edit profile).
 */
export function LoozerProfile({
  userId,
  isOwnProfile = false,
  spectator = false,
  data: initialData,
}: {
  userId: string;
  isOwnProfile?: boolean;
  spectator?: boolean;
  data?: LoozerProfileData;
}) {
  const router = useRouter();
  const musicPlayer = useMusicPlayerOptional();
  const [loading, setLoading] = useState(!initialData);
  const [profileData, setProfileData] = useState<LoozerProfileData | null>(initialData || null);
  const [startingChat, setStartingChat] = useState(false);

  // Accordion state — bio open by default, others closed
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["bio", "accolades"]));

  // Family tree — lazy-loaded the first time the accordion is opened.
  const [descendants, setDescendants] = useState<DescendantLoozer[] | null>(null);
  const [descendantsLoading, setDescendantsLoading] = useState(false);
  const familyRequestedRef = useRef(false);

  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (initialData) return; // already have data
    fetch(`/api/loozers/${userId}`)
      .then((res) => res.json())
      .then((d) => {
        setProfileData({
          profile: d.profile,
          accolades: d.accolades || [],
          taggedPhotos: d.taggedPhotos || [],
          taggedPhotosCount: d.taggedPhotosCount ?? 0,
          handicapIndex: d.handicapIndex ?? null,
          eightBagAverage: d.eightBagAverage ?? null,
          avgScrambleScore: d.avgScrambleScore ?? null,
          bio: d.bio ?? null,
          song: d.song ?? null,
          scorecards: d.scorecards || [],
          isFounder: d.isFounder === true,
          sponsor: d.sponsor ?? null,
          eventsAttended: d.eventsAttended ?? 0,
          currentRoomNumber: d.currentRoomNumber ?? null,
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userId, initialData]);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    if (!openSections.has("family")) return;
    if (familyRequestedRef.current) return;
    familyRequestedRef.current = true;
    setDescendantsLoading(true);
    fetch(`/api/loozers/${userId}/descendants`)
      .then((res) => res.json())
      .then((d) => {
        setDescendants(Array.isArray(d.loozers) ? d.loozers : []);
      })
      .catch(() => setDescendants([]))
      .finally(() => setDescendantsLoading(false));
  }, [openSections, userId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profileData?.profile) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-lg font-medium">Loozer not found</p>
      </div>
    );
  }

  const { profile, accolades, taggedPhotos, taggedPhotosCount, handicapIndex, eightBagAverage, avgScrambleScore, bio, song, scorecards, isFounder, sponsor, eventsAttended, currentRoomNumber } = profileData;

  const openChat = async () => {
    if (spectator) return;
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
    if (!song || !musicPlayer) return;
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
  const showComms = !spectator;

  return (
    <div className="space-y-4">
      {/* ── Compact Header ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          {/* Avatar + sponsor */}
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0 max-w-[80px]">
            {profile.avatar_url ? (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                aria-label={`View ${profile.display_name}'s photo`}
                className="w-16 h-16 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center active:opacity-80 transition-opacity"
              >
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  className="w-full h-full object-cover"
                />
              </button>
            ) : (
              <div className="w-16 h-16 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center">
                <span className="text-2xl font-bold">
                  {getInitials(profile.display_name)}
                </span>
              </div>
            )}
            {!isFounder && sponsor && (
              <Link
                href={`${spectator ? "/spectator/loozers" : "/loozers"}?focus=${sponsor.id}`}
                className="flex flex-col items-center gap-0.5 text-green-700 active:opacity-80"
                title={`Sponsored by ${sponsor.display_name}`}
              >
                {sponsor.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sponsor.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[0.625rem] font-bold text-gray-500">
                    {sponsor.display_name?.[0]?.toUpperCase() || "?"}
                  </span>
                )}
                <span className="text-[0.625rem] font-medium leading-tight text-center truncate max-w-full">
                  {sponsor.display_name}
                </span>
              </Link>
            )}
          </div>

          {/* Name + stats */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900 truncate">
                {profile.display_name}
              </h1>
              {/* Favorite star (issue #140). Authenticated, non-self only —
                  the spectator profile lives outside the FavoritesProvider. */}
              {!spectator && !isOwnProfile && (
                <FavoriteStarButton
                  favoriteUserId={profile.id}
                  name={profile.display_name}
                  size="lg"
                  className="flex-shrink-0"
                />
              )}
            </div>
            {!spectator && profile.full_name && profile.full_name !== profile.display_name && (
              <p className="text-sm text-gray-500 truncate">{profile.full_name}</p>
            )}
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {handicapIndex != null && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-0.5">
                  Handicap: {handicapIndex}
                </span>
              )}
              {eventsAttended != null && eventsAttended > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-2 py-0.5">
                  Attended: {eventsAttended}
                </span>
              )}
            </div>
            {isFounder && (
              <div className="mt-1">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5">
                  ★ Founding Father
                </span>
              </div>
            )}
          </div>

          {/* Comms grid — authenticated only */}
          {showComms && (
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
              {song && musicPlayer && (
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
          )}
        </div>
      </div>

      {/* ── During-event Room number — prominent, links to /rooms ── */}
      {currentRoomNumber && !spectator && (
        <Link
          href="/rooms"
          className="block bg-white rounded-2xl p-6 border-2 border-green-600 shadow-sm active:opacity-90 transition-opacity"
        >
          <p className="text-green-600 text-sm font-medium uppercase tracking-wide">
            {isOwnProfile ? "Your Room" : `${profile.display_name}'s Room`}
          </p>
          <div className="mt-2">
            <span className="text-5xl font-bold text-green-700">
              {currentRoomNumber}
            </span>
          </div>
        </Link>
      )}

      {/* ── Accordion Sections ── */}

      {/* Accolades — top-of-stack so the trophy case is the first thing you see */}
      {accolades.length > 0 && (
        <Accordion
          title="Accolades"
          count={accolades.length}
          isOpen={openSections.has("accolades")}
          onToggle={() => toggleSection("accolades")}
        >
          <AccoladesList
            accolades={accolades}
            profileUserId={profile.id}
            accoladeHrefBase={spectator ? "/spectator/accolades" : "/accolades"}
            loozerHrefBase={spectator ? "/spectator/loozers" : "/loozers"}
          />
        </Accordion>
      )}

      {/* Bio — only shown if bio exists */}
      {bio && bio.content && (
        <Accordion
          title="Biography"
          isOpen={openSections.has("bio")}
          onToggle={() => toggleSection("bio")}
        >
          <div className="rich-bio prose prose-sm max-w-none text-gray-700">
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

      {/* Fake Ads tagged with this Loozer (non-clickable; you're already here) */}
      <FakeAdCarousel userId={userId} clickable={false} />

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
            {!spectator && (
              <Link
                href={`/gallery?tagged=${userId}`}
                className={`block text-center mt-2 ${BTN_PRIMARY}`}
              >
                See All Photos
              </Link>
            )}
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
            {scorecards.map((sc, i) => {
              const toParStr = sc.scoreToPar === 0 ? "E" : sc.scoreToPar > 0 ? `+${sc.scoreToPar}` : `${sc.scoreToPar}`;
              const dateStr = (() => {
                const [y, m, d] = sc.roundDate.split("-").map(Number);
                return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              })();
              const content = (
                <>
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
                </>
              );
              return !spectator && sc.roundId ? (
                <Link
                  key={sc.roundId}
                  href={`/my-rounds/rounds/${sc.roundId}`}
                  className="block bg-gray-50 rounded-lg p-3 active:bg-gray-100 transition-colors"
                >
                  {content}
                </Link>
              ) : (
                <div key={i} className="bg-gray-50 rounded-lg p-3">
                  {content}
                </div>
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

      {/* About */}
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

      {/* Family Tree — this Loozer + everyone they sponsored, recursively. Auth-only. */}
      {!spectator && (
        <Accordion
          title="Family Tree"
          count={descendants ? Math.max(descendants.length - 1, 0) : undefined}
          isOpen={openSections.has("family")}
          onToggle={() => toggleSection("family")}
        >
          {descendantsLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : descendants && descendants.length > 1 ? (
            <LoozerTree
              loozers={descendants}
              focusUserId={userId}
              basePath="/loozers"
              heightStyle="500px"
              orientation="vertical"
              fitOnLoad
            />
          ) : descendants ? (
            <p className="text-sm text-gray-400 italic">
              {profile.display_name} hasn&apos;t sponsored any Loozers yet.
            </p>
          ) : null}
        </Accordion>
      )}

      {lightboxOpen && profile.avatar_url && (
        <AvatarLightbox
          src={profile.avatar_url}
          alt={profile.display_name}
          onClose={() => setLightboxOpen(false)}
        />
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

