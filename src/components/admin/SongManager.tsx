"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { BottomDrawer } from "@/components/admin/BottomDrawer";
import { compressImage, generateThumbnail } from "@/lib/gallery/compress";
import ReactMarkdown from "react-markdown";

interface User {
  id: string;
  display_name: string;
}

interface Song {
  id: string;
  title: string;
  mp3_url: string;
  art_url: string | null;
  art_thumb_url: string | null;
  lyrics: string | null;
  duration_seconds: number | null;
  sort_order: number;
  tagged_user: { id: string; display_name: string } | null;
  play_count: number;
  like_count: number;
}

interface PlayListener {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  count: number;
  last_played_at: string;
}

interface LikeListener {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

interface Listeners {
  plays: PlayListener[];
  likes: LikeListener[];
}

type SortKey = "sort_order" | "title" | "plays" | "likes";
type SortDir = "asc" | "desc";

export function SongManager() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Sort state
  const [sortBy, setSortBy] = useState<SortKey>("sort_order");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Drag-to-reorder state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [touchPreview, setTouchPreview] = useState<{ name: string; y: number } | null>(null);
  const touchCurrentIndex = useRef<number | null>(null);
  const songListRef = useRef<HTMLDivElement>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [listenersBySong, setListenersBySong] = useState<Record<string, Listeners>>({});
  const [listenersLoading, setListenersLoading] = useState<Record<string, boolean>>({});
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Add form state
  const [title, setTitle] = useState("");
  const [taggedUserId, setTaggedUserId] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [showLyricsPreview, setShowLyricsPreview] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const mp3InputRef = useRef<HTMLInputElement>(null);
  const artInputRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editLyrics, setEditLyrics] = useState("");
  const [editTaggedUserId, setEditTaggedUserId] = useState("");
  const [editShowPreview, setEditShowPreview] = useState(false);
  const editArtInputRef = useRef<HTMLInputElement>(null);

  const fetchSongs = useCallback(async () => {
    const res = await fetch("/api/admin/songs");
    const data = await res.json();
    if (data.songs) setSongs(data.songs);
  }, []);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (data.users) setUsers(data.users);
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([fetchSongs(), fetchUsers()]);
      setLoading(false);
    }
    init();
  }, [fetchSongs, fetchUsers]);

  useEffect(() => {
    const handler = () => setShowAdd((v) => !v);
    window.addEventListener("toggle-add-song", handler);
    return () => window.removeEventListener("toggle-add-song", handler);
  }, []);

  const isDraggable = sortBy === "sort_order";

  const sortedSongs = useMemo(() => {
    const arr = [...songs];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "sort_order") cmp = a.sort_order - b.sort_order;
      else if (sortBy === "title") cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      else if (sortBy === "plays") cmp = a.play_count - b.play_count;
      else if (sortBy === "likes") cmp = a.like_count - b.like_count;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [songs, sortBy, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === "sort_order") {
      setSortBy("sort_order");
      setSortDir("asc");
    } else if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      // Default direction: alphabetical asc, counts desc
      setSortDir(key === "title" ? "asc" : "desc");
    }
  };

  // Extract duration from MP3 file
  const handleMp3Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setDurationSeconds(null);
      return;
    }

    const audio = new Audio();
    audio.addEventListener("loadedmetadata", () => {
      setDurationSeconds(Math.round(audio.duration));
      URL.revokeObjectURL(audio.src);
    });
    audio.src = URL.createObjectURL(file);
  };

  const handleAdd = async () => {
    const mp3File = mp3InputRef.current?.files?.[0];
    if (!title.trim() || !mp3File) return;

    setSaving(true);
    try {
      const artFile = artInputRef.current?.files?.[0];
      let artBlob: Blob | null = null;
      let thumbBlob: Blob | null = null;

      if (artFile) {
        const [full, thumb] = await Promise.all([
          compressImage(artFile, 512, 0.85),
          generateThumbnail(artFile, 80),
        ]);
        artBlob = full.blob;
        thumbBlob = thumb;
      }

      const urlRes = await fetch("/api/admin/songs/upload-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hasArt: !!artBlob, hasThumb: !!thumbBlob }),
      });
      if (!urlRes.ok) {
        const data = await urlRes.json().catch(() => ({}));
        throw new Error(data.error || `${urlRes.status} ${urlRes.statusText}`);
      }
      const urls = await urlRes.json();

      const mp3Upload = await fetch(urls.mp3.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "max-age=31536000" },
        body: mp3File,
      });
      if (!mp3Upload.ok) {
        throw new Error(`MP3 upload failed: ${mp3Upload.status} ${mp3Upload.statusText}`);
      }

      let artUrl: string | null = null;
      let artThumbUrl: string | null = null;

      if (artBlob && urls.art) {
        const artUpload = await fetch(urls.art.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg", "Cache-Control": "max-age=31536000" },
          body: artBlob,
        });
        if (artUpload.ok) artUrl = urls.art.publicUrl;
      }

      if (thumbBlob && urls.thumb) {
        const thumbUpload = await fetch(urls.thumb.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg", "Cache-Control": "max-age=31536000" },
          body: thumbBlob,
        });
        if (thumbUpload.ok) artThumbUrl = urls.thumb.publicUrl;
      }

      const res = await fetch("/api/admin/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          songId: urls.songId,
          title: title.trim(),
          mp3Url: urls.mp3.publicUrl,
          artUrl,
          artThumbUrl,
          lyrics: lyrics.trim() || null,
          taggedUserId: taggedUserId || null,
          durationSeconds: durationSeconds || null,
          sortOrder: songs.length,
        }),
      });

      if (res.ok) {
        await fetchSongs();
        setTitle("");
        setTaggedUserId("");
        setLyrics("");
        setDurationSeconds(null);
        setShowLyricsPreview(false);
        if (mp3InputRef.current) mp3InputRef.current.value = "";
        if (artInputRef.current) artInputRef.current.value = "";
        setShowAdd(false);
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `${res.status} ${res.statusText}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Failed to add song.\n\nError: ${msg}\n\nPlease share this with Jeff.`);
    }
    setSaving(false);
  };

  const fetchListeners = useCallback(async (songId: string) => {
    setListenersLoading((prev) => ({ ...prev, [songId]: true }));
    try {
      const res = await fetch(`/api/admin/songs/${songId}/listeners`);
      if (res.ok) {
        const data = (await res.json()) as Listeners;
        setListenersBySong((prev) => ({ ...prev, [songId]: data }));
      }
    } finally {
      setListenersLoading((prev) => ({ ...prev, [songId]: false }));
    }
  }, []);

  const toggleExpand = (song: Song) => {
    if (expandedId === song.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(song.id);
    if (!listenersBySong[song.id]) {
      void fetchListeners(song.id);
    }
  };

  const openEdit = (song: Song) => {
    setEditingSong(song);
    setEditTitle(song.title);
    setEditLyrics(song.lyrics || "");
    setEditTaggedUserId(song.tagged_user?.id || "");
    setEditShowPreview(false);
    if (editArtInputRef.current) editArtInputRef.current.value = "";
  };

  const saveEdit = async () => {
    if (!editingSong) return;
    const songId = editingSong.id;
    setSaving(true);

    const newArtFile = editArtInputRef.current?.files?.[0];
    if (newArtFile) {
      const [full, thumb] = await Promise.all([
        compressImage(newArtFile, 512, 0.85),
        generateThumbnail(newArtFile, 80),
      ]);
      const formData = new FormData();
      formData.set("id", songId);
      formData.set("art", new File([full.blob], "art.jpg", { type: "image/jpeg" }));
      formData.set("art_thumb", new File([thumb], "thumb.jpg", { type: "image/jpeg" }));
      const artRes = await fetch("/api/admin/songs/art", {
        method: "PUT",
        body: formData,
      });
      if (!artRes.ok) {
        const data = await artRes.json().catch(() => ({}));
        alert(`Failed to upload art: ${data.error || artRes.statusText}`);
        setSaving(false);
        return;
      }
    }

    const res = await fetch("/api/admin/songs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: songId,
        title: editTitle.trim(),
        lyrics: editLyrics.trim() || null,
        tagged_user_id: editTaggedUserId || null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Failed to save: ${data.error || res.statusText}`);
    }
    await fetchSongs();
    setEditingSong(null);
    setSaving(false);
  };

  const deleteSong = (song: Song) => {
    setConfirmModal({
      title: "Delete Song",
      message: `Delete "${song.title}"? This will remove the song and its files permanently.`,
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch("/api/admin/songs", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: song.id }),
        });
        if (expandedId === song.id) setExpandedId(null);
        if (editingSong?.id === song.id) setEditingSong(null);
        await fetchSongs();
      },
    });
  };

  const handleDragEnd = async (fromIdx: number, toIdx: number) => {
    if (!isDraggable || fromIdx === toIdx) return;
    const newList = [...sortedSongs];
    const [moved] = newList.splice(fromIdx, 1);
    newList.splice(toIdx, 0, moved);

    const reordered = newList.map((s, i) => ({ ...s, sort_order: i }));
    setSongs(reordered);

    await fetch("/api/admin/songs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reorder",
        order: reordered.map((s) => ({ id: s.id, sort_order: s.sort_order })),
      }),
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">{songs.length} {songs.length === 1 ? "song" : "songs"}</p>
      {showAdd && (
        <div className="px-4 py-3 mb-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
          <input
            type="text"
            placeholder="Song title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
          />
          <select
            value={taggedUserId}
            onChange={(e) => setTaggedUserId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
            style={{ backgroundColor: "transparent" }}
          >
            <option value="">No tagged Loozer</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name}
              </option>
            ))}
          </select>
          <div>
            <label className="block text-xs text-gray-500 mb-1">MP3 File *</label>
            <input
              ref={mp3InputRef}
              type="file"
              accept="audio/mpeg,audio/mp3"
              onChange={handleMp3Change}
              className="w-full text-sm"
            />
            {durationSeconds && (
              <p className="text-xs text-gray-500 mt-1">
                Duration: {formatDuration(durationSeconds)}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Album Art (optional)</label>
            <input
              ref={artInputRef}
              type="file"
              accept="image/*"
              className="w-full text-sm"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Lyrics (optional, markdown)</label>
              {lyrics.trim() && (
                <button
                  onClick={() => setShowLyricsPreview(!showLyricsPreview)}
                  className="text-xs text-green-700 font-medium"
                >
                  {showLyricsPreview ? "Edit" : "Preview"}
                </button>
              )}
            </div>
            {showLyricsPreview ? (
              <div className="p-3 bg-white border border-gray-300 rounded-lg prose prose-sm max-w-none text-gray-700 min-h-[80px]">
                <ReactMarkdown>{lyrics}</ReactMarkdown>
              </div>
            ) : (
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Song lyrics..."
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
              />
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!title.trim() || !mp3InputRef.current?.files?.length || saving}
              className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Uploading..." : "Add Song"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 text-sm text-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sortable column header */}
      <div className="flex items-center gap-2 px-4 py-1.5 -mx-4 border-y border-gray-100 bg-gray-50/50 text-[0.625rem] uppercase tracking-wider text-gray-500 font-semibold">
        <SortHeader
          label="#"
          active={sortBy === "sort_order"}
          dir={sortDir}
          onClick={() => toggleSort("sort_order")}
          className="w-4 flex-shrink-0"
          ariaLabel="Sort by play order"
        />
        <span className="w-8 flex-shrink-0" aria-hidden />
        <SortHeader
          label="Title"
          active={sortBy === "title"}
          dir={sortDir}
          onClick={() => toggleSort("title")}
          className="flex-1 min-w-0"
        />
        <SortHeader
          label="Plays"
          active={sortBy === "plays"}
          dir={sortDir}
          onClick={() => toggleSort("plays")}
          className="w-12 flex-shrink-0 justify-end"
        />
        <SortHeader
          label="Likes"
          active={sortBy === "likes"}
          dir={sortDir}
          onClick={() => toggleSort("likes")}
          className="w-12 flex-shrink-0 justify-end"
        />
        <span className="w-6 flex-shrink-0" aria-hidden />
      </div>

      {/* Song list */}
      <div className="divide-y divide-gray-100 -mx-4" ref={songListRef}>
        {/* Floating touch preview */}
        {touchPreview && (
          <div
            className="fixed left-4 right-4 z-50 pointer-events-none"
            style={{ top: touchPreview.y - 20 }}
          >
            <div className="bg-green-600 text-white rounded-xl px-4 py-2 shadow-lg text-sm font-medium text-center opacity-90">
              {touchPreview.name}
            </div>
          </div>
        )}
        {sortedSongs.map((song, index) => {
          const expanded = expandedId === song.id;
          return (
            <div key={song.id}>
              {/* Drop indicator line */}
              {isDraggable && dropTargetIndex === index && dragIndex !== null && dragIndex !== index && (
                <div className="h-1 bg-green-500 rounded-full mx-4" />
              )}
              <div
                data-drag-item
                draggable={isDraggable && !expanded}
                onDragStart={() => { if (isDraggable) setDragIndex(index); }}
                onDragOver={(e) => { if (!isDraggable) return; e.preventDefault(); setDropTargetIndex(index); }}
                onDragLeave={() => setDropTargetIndex((prev) => prev === index ? null : prev)}
                onDrop={() => {
                  if (isDraggable && dragIndex !== null) {
                    handleDragEnd(dragIndex, index);
                    setDragIndex(null);
                    setDropTargetIndex(null);
                  }
                }}
                onDragEnd={() => { setDragIndex(null); setDropTargetIndex(null); }}
                onTouchStart={(e) => {
                  if (!isDraggable) return;
                  const touch = e.touches[0];
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (touch.clientX - rect.left > 40) return;
                  touchCurrentIndex.current = index;
                  setDragIndex(index);
                  setDropTargetIndex(index);
                  setTouchPreview({ name: song.title, y: touch.clientY });
                }}
                onTouchMove={(e) => {
                  if (!isDraggable || dragIndex === null || !songListRef.current) return;
                  e.preventDefault();
                  const touch = e.touches[0];
                  setTouchPreview((prev) => prev ? { ...prev, y: touch.clientY } : null);
                  const items = songListRef.current.querySelectorAll("[data-drag-item]");
                  for (let i = 0; i < items.length; i++) {
                    const rect = items[i].getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    if (touch.clientY < midY) {
                      touchCurrentIndex.current = i;
                      setDropTargetIndex(i);
                      return;
                    }
                  }
                  touchCurrentIndex.current = items.length - 1;
                  setDropTargetIndex(items.length - 1);
                }}
                onTouchEnd={() => {
                  if (isDraggable && dragIndex !== null && touchCurrentIndex.current !== null) {
                    handleDragEnd(dragIndex, touchCurrentIndex.current);
                  }
                  setDragIndex(null);
                  setDropTargetIndex(null);
                  setTouchPreview(null);
                  touchCurrentIndex.current = null;
                }}
                className={`transition-colors ${
                  dragIndex === index ? "opacity-40 bg-green-50" : ""
                } ${isDraggable && dropTargetIndex === index && dragIndex !== null && dragIndex !== index ? "bg-green-50" : ""}`}
              >
                {/* Header row — always visible */}
                <div className="px-4 py-1.5 flex items-center gap-2">
                  {/* Sort order / drag handle */}
                  {isDraggable ? (
                    <div className="text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none w-4">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 6a2 2 0 112 0 2 2 0 01-2 0zm8 0a2 2 0 112 0 2 2 0 01-2 0zm-8 6a2 2 0 112 0 2 2 0 01-2 0zm8 0a2 2 0 112 0 2 2 0 01-2 0zm-8 6a2 2 0 112 0 2 2 0 01-2 0zm8 0a2 2 0 112 0 2 2 0 01-2 0z" />
                      </svg>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 tabular-nums w-4 text-right flex-shrink-0">
                      {song.sort_order + 1}
                    </div>
                  )}

                  {/* Album art */}
                  {(song.art_thumb_url || song.art_url) ? (
                    <img src={song.art_thumb_url || song.art_url!} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                    </div>
                  )}

                  {/* Title + subtitle (tap to edit) */}
                  <button
                    type="button"
                    onClick={() => openEdit(song)}
                    className="flex-1 min-w-0 text-left -my-1 py-1 rounded hover:bg-gray-50"
                  >
                    <div className="text-sm font-medium text-gray-900 truncate leading-tight">{song.title}</div>
                    {(song.duration_seconds || song.tagged_user) && (
                      <div className="text-xs text-gray-400 truncate">
                        {song.duration_seconds ? formatDuration(song.duration_seconds) : ""}
                        {song.duration_seconds && song.tagged_user ? " · " : ""}
                        {song.tagged_user?.display_name || ""}
                      </div>
                    )}
                  </button>

                  {/* Plays */}
                  <div className="text-xs text-gray-500 tabular-nums flex items-center gap-0.5 w-12 justify-end flex-shrink-0">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{song.play_count}</span>
                  </div>

                  {/* Likes */}
                  <div className="text-xs text-gray-500 tabular-nums flex items-center gap-0.5 w-12 justify-end flex-shrink-0">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    <span>{song.like_count}</span>
                  </div>

                  {/* Expand chevron */}
                  <button
                    onClick={() => toggleExpand(song)}
                    className="text-gray-400 hover:text-gray-600 p-1 -mr-1 flex-shrink-0"
                    aria-label={expanded ? "Collapse" : "Expand"}
                  >
                    <svg
                      className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Expanded listeners panel */}
                {expanded && (
                  <ListenersPanel
                    songId={song.id}
                    listeners={listenersBySong[song.id]}
                    loading={!!listenersLoading[song.id]}
                  />
                )}
              </div>
            </div>
          );
        })}
        {songs.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-gray-400">
            No songs yet. Add one to get started.
          </div>
        )}
      </div>

      {/* Edit drawer */}
      <BottomDrawer
        open={!!editingSong}
        onClose={() => setEditingSong(null)}
        title={editingSong?.title || "Edit song"}
      >
        {editingSong && (
          <div className="px-6 py-4 space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tagged Loozer</label>
              <select
                value={editTaggedUserId}
                onChange={(e) => setEditTaggedUserId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
                style={{ backgroundColor: "transparent" }}
              >
                <option value="">No tagged Loozer</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {editingSong.art_url ? "Replace Album Art" : "Album Art"}
              </label>
              <input
                ref={editArtInputRef}
                type="file"
                accept="image/*"
                className="w-full text-sm"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-500">Lyrics (markdown)</label>
                {editLyrics.trim() && (
                  <button
                    onClick={() => setEditShowPreview(!editShowPreview)}
                    className="text-xs text-green-700 font-medium"
                  >
                    {editShowPreview ? "Edit" : "Preview"}
                  </button>
                )}
              </div>
              {editShowPreview ? (
                <div className="p-3 bg-white border border-gray-300 rounded-lg prose prose-sm max-w-none text-gray-700 min-h-[120px]">
                  <ReactMarkdown>{editLyrics}</ReactMarkdown>
                </div>
              ) : (
                <textarea
                  value={editLyrics}
                  onChange={(e) => setEditLyrics(e.target.value)}
                  placeholder="Song lyrics..."
                  rows={6}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
                />
              )}
            </div>
            <div className="flex gap-2 items-center pt-2">
              <button
                onClick={() => saveEdit()}
                disabled={!editTitle.trim() || saving}
                className="flex-1 bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => deleteSong(editingSong)}
                className="px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1.5"
                aria-label="Delete song"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </div>
          </div>
        )}
      </BottomDrawer>

      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}

function ListenersPanel({
  songId,
  listeners,
  loading,
}: {
  songId: string;
  listeners: Listeners | undefined;
  loading: boolean;
}) {
  void songId;
  if (loading && !listeners) {
    return (
      <div className="px-4 pb-3 pt-1 flex justify-center">
        <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  const plays = listeners?.plays ?? [];
  const likes = listeners?.likes ?? [];

  return (
    <div className="px-4 pb-3 pt-2 grid grid-cols-2 gap-3 bg-gray-50/50">
      <ListenerColumn
        title="Plays"
        emptyText="No plays yet"
        items={plays.map((p) => ({
          id: p.user_id,
          name: p.display_name,
          avatar: p.avatar_url,
          meta: p.count > 1 ? `×${p.count}` : null,
        }))}
      />
      <ListenerColumn
        title="Likes"
        emptyText="No likes yet"
        items={likes.map((l) => ({
          id: l.user_id,
          name: l.display_name,
          avatar: l.avatar_url,
          meta: null,
        }))}
      />
    </div>
  );
}

function ListenerColumn({
  title,
  emptyText,
  items,
}: {
  title: string;
  emptyText: string;
  items: { id: string; name: string; avatar: string | null; meta: string | null }[];
}) {
  return (
    <div>
      <div className="text-[0.625rem] uppercase tracking-wider text-gray-500 font-semibold mb-1">
        {title} <span className="text-gray-400 normal-case font-normal">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-gray-400 italic">{emptyText}</div>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-1.5 text-xs text-gray-700">
              {it.avatar ? (
                <img src={it.avatar} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[0.5625rem] font-semibold text-gray-500 flex-shrink-0">
                  {it.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="truncate flex-1">{it.name}</span>
              {it.meta && <span className="text-gray-400 tabular-nums flex-shrink-0">{it.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  className = "",
  ariaLabel,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel || `Sort by ${label}`}
      className={`flex items-center gap-0.5 hover:text-gray-700 transition-colors ${
        active ? "text-green-700" : ""
      } ${className}`}
    >
      <span className="truncate">{label}</span>
      {active && (
        <svg className="w-2.5 h-2.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          {dir === "asc" ? (
            <path d="M5.293 12.95a1 1 0 011.414 0L10 9.657l3.293 3.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414z" />
          ) : (
            <path d="M14.707 7.05a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L10 10.343l3.293-3.293a1 1 0 011.414 0z" />
          )}
        </svg>
      )}
    </button>
  );
}
