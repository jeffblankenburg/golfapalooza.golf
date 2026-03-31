"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
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

export function SongManager() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
    const formData = new FormData();
    formData.set("title", title.trim());
    formData.set("mp3", mp3File);
    if (taggedUserId) formData.set("tagged_user_id", taggedUserId);
    if (lyrics.trim()) formData.set("lyrics", lyrics.trim());
    if (durationSeconds) formData.set("duration_seconds", String(durationSeconds));
    formData.set("sort_order", String(songs.length));

    const artFile = artInputRef.current?.files?.[0];
    if (artFile) {
      // Compress art to 512px (hero/lock screen) and 80px thumbnail
      const [full, thumb] = await Promise.all([
        compressImage(artFile, 512, 0.85),
        generateThumbnail(artFile, 80),
      ]);
      formData.set("art", new File([full.blob], "art.jpg", { type: "image/jpeg" }));
      formData.set("art_thumb", new File([thumb], "thumb.jpg", { type: "image/jpeg" }));
    }

    const res = await fetch("/api/admin/songs", {
      method: "POST",
      body: formData,
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
    }
    setSaving(false);
  };

  const startEdit = (song: Song) => {
    setEditingId(song.id);
    setEditTitle(song.title);
    setEditLyrics(song.lyrics || "");
    setEditTaggedUserId(song.tagged_user?.id || "");
    setEditShowPreview(false);
  };

  const saveEdit = async (songId: string) => {
    setSaving(true);

    // Check if new art was selected
    const newArtFile = editArtInputRef.current?.files?.[0];
    if (newArtFile) {
      // Compress and upload art via a separate POST-like call using FormData
      const [full, thumb] = await Promise.all([
        compressImage(newArtFile, 512, 0.85),
        generateThumbnail(newArtFile, 80),
      ]);
      const formData = new FormData();
      formData.set("id", songId);
      formData.set("art", new File([full.blob], "art.jpg", { type: "image/jpeg" }));
      formData.set("art_thumb", new File([thumb], "thumb.jpg", { type: "image/jpeg" }));
      await fetch("/api/admin/songs/art", {
        method: "PUT",
        body: formData,
      });
    }

    await fetch("/api/admin/songs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: songId,
        title: editTitle.trim(),
        lyrics: editLyrics.trim() || null,
        tagged_user_id: editTaggedUserId || null,
      }),
    });
    await fetchSongs();
    setEditingId(null);
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
        await fetchSongs();
      },
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
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
          />
          <select
            value={taggedUserId}
            onChange={(e) => setTaggedUserId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
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

      {/* Song list */}
      <div className="divide-y divide-gray-100 -mx-4">
        {songs.map((song) => (
          <div key={song.id} className="px-4 py-1.5">
            {editingId === song.id ? (
              /* Edit mode */
              <div className="space-y-2">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
                />
                <select
                  value={editTaggedUserId}
                  onChange={(e) => setEditTaggedUserId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
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
                  <label className="block text-xs text-gray-500 mb-1">
                    {song.art_url ? "Replace Album Art" : "Album Art"}
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
                    <div className="p-3 bg-white border border-gray-300 rounded-lg prose prose-sm max-w-none text-gray-700 min-h-[80px]">
                      <ReactMarkdown>{editLyrics}</ReactMarkdown>
                    </div>
                  ) : (
                    <textarea
                      value={editLyrics}
                      onChange={(e) => setEditLyrics(e.target.value)}
                      placeholder="Song lyrics..."
                      rows={4}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
                    />
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(song.id)}
                    disabled={!editTitle.trim() || saving}
                    className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-4 text-sm text-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Display mode */
              <div className="flex items-center gap-2">
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
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate leading-tight">{song.title}</div>
                  <div className="text-xs text-gray-400 flex items-center gap-1.5">
                    {song.duration_seconds ? formatDuration(song.duration_seconds) : ""}
                    {song.duration_seconds && song.tagged_user ? " · " : ""}
                    {song.tagged_user?.display_name || ""}
                    {(song.duration_seconds || song.tagged_user) && (song.play_count > 0 || song.like_count > 0) ? " · " : ""}
                    {song.play_count > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {song.play_count}
                      </span>
                    )}
                    {song.like_count > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                        {song.like_count}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => startEdit(song)}
                  className="text-xs text-green-700 font-medium px-2 py-1 rounded-lg hover:bg-green-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteSong(song)}
                  className="text-gray-300 hover:text-red-500 p-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}
        {songs.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-gray-400">
            No songs yet. Add one to get started.
          </div>
        )}
      </div>

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
