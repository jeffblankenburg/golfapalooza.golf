"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyGif {
  id: string;
  images: {
    fixed_width: GiphyImage;
    downsized: GiphyImage;
  };
}

const GIPHY_API = "https://api.giphy.com/v1/gifs";
const API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
const LIMIT = 25;

export function GifPicker({ onSelect }: { onSelect: (gifUrl: string) => void }) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchGifs = useCallback(async (searchQuery: string, newOffset: number) => {
    if (!API_KEY) return;
    setLoading(true);
    try {
      const endpoint = searchQuery.trim()
        ? `${GIPHY_API}/search?api_key=${API_KEY}&q=${encodeURIComponent(searchQuery)}&limit=${LIMIT}&offset=${newOffset}&rating=pg-13`
        : `${GIPHY_API}/trending?api_key=${API_KEY}&limit=${LIMIT}&offset=${newOffset}&rating=pg-13`;

      const res = await fetch(endpoint);
      const data = await res.json();
      const newGifs = data.data || [];

      if (newOffset === 0) {
        setGifs(newGifs);
      } else {
        setGifs((prev) => [...prev, ...newGifs]);
      }
      setHasMore(newGifs.length === LIMIT);
      setOffset(newOffset + newGifs.length);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Load trending on mount
  useEffect(() => {
    fetchGifs("", 0);
  }, [fetchGifs]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setOffset(0);
      fetchGifs(query, 0);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchGifs]);

  const loadMore = () => {
    if (!loading && hasMore) {
      fetchGifs(query, offset);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      loadMore();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Search bar */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="flex items-center bg-gray-100 rounded-lg px-3 py-2 gap-2">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIFs"
            autoFocus
            className="flex-1 text-[0.9375rem] bg-transparent outline-none placeholder-gray-400"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* GIF grid */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain p-2"
        onScroll={handleScroll}
      >
        {gifs.length === 0 && !loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <p className="text-sm">No GIFs found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => onSelect(gif.images.downsized.url)}
                className="relative overflow-hidden rounded-lg bg-gray-100 active:opacity-75"
                style={{
                  aspectRatio: `${gif.images.fixed_width.width} / ${gif.images.fixed_width.height}`,
                }}
              >
                <img
                  src={gif.images.fixed_width.url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-4">
            <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* GIPHY attribution */}
      <div className="px-3 py-1.5 border-t border-gray-100 flex justify-center">
        <span className="text-[0.625rem] text-gray-400 font-medium tracking-wide">Powered by GIPHY</span>
      </div>
    </div>
  );
}
