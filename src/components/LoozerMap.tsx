"use client";

import { useEffect, useRef, useState, useMemo } from "react";

interface LoozerLocation {
  id: string;
  display_name: string;
  avatar_url: string | null;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
}

interface LoozerMapProps {
  basePath?: string;
  userLocation?: { lat: number; lng: number } | null;
  /** Bumped by the parent (Locate-me chip) to request a re-fly to the user pin. */
  flyToUserNonce?: number;
  currentUserId?: string | null;
}

// Golfapalooza HQ — fallback center when neither GPS nor the current user's
// city/state is available.
const TERRA_ALTA: [number, number] = [39.4448, -79.5450];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] || "?").toUpperCase();
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.7613; // miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function formatDistance(mi: number): string {
  if (mi < 10) return `${(Math.round(mi * 10) / 10).toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

/** Group Loozers by city-level coordinates so two Loozers in Columbus stack
 *  into one marker rather than rendering on top of each other. */
function groupByCoord(loozers: LoozerLocation[]) {
  const groups = new Map<string, LoozerLocation[]>();
  for (const l of loozers) {
    const key = `${l.latitude.toFixed(4)},${l.longitude.toFixed(4)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(l);
  }
  return Array.from(groups.values());
}

export function LoozerMap({ basePath = "/loozers", userLocation, flyToUserNonce, currentUserId }: LoozerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMarkerRef = useRef<any>(null);

  const [loozers, setLoozers] = useState<LoozerLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState<LoozerLocation[] | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/loozers/locations")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setLoozers(data.loozers || []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => groupByCoord(loozers), [loozers]);

  // Map init — runs once when the container is ready.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    async function init() {
      const mapboxgl = (await import("mapbox-gl")).default;
      // @ts-expect-error CSS import has no types
      await import("mapbox-gl/dist/mapbox-gl.css");
      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [-95, 39], // continental US default
        zoom: 3.5,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-left");
      mapRef.current = map;
      map.once("load", () => {
        if (!cancelled) setMapReady(true);
      });
    }

    init();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current = [];
      userMarkerRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Render markers when groups or map change.
  useEffect(() => {
    if (!mapReady || !mapRef.current || groups.length === 0) return;
    let cancelled = false;
    const map = mapRef.current;

    async function render() {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;

      // Clear existing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      markersRef.current.forEach((m: any) => m.remove());
      markersRef.current = [];

      for (const group of groups) {
        const first = group[0];

        const el = document.createElement("button");
        el.type = "button";
        el.className =
          "relative w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-md bg-green-700 text-white flex items-center justify-center text-xs font-bold cursor-pointer";
        if (first.avatar_url) {
          const img = document.createElement("img");
          img.src = first.avatar_url;
          img.alt = first.display_name;
          img.className = "w-full h-full object-cover";
          el.appendChild(img);
        } else {
          el.textContent = getInitials(first.display_name);
        }
        if (group.length > 1) {
          const badge = document.createElement("span");
          badge.className =
            "absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center justify-center border border-white";
          badge.textContent = String(group.length);
          el.appendChild(badge);
        }
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          setActiveGroup(group);
          map.flyTo({ center: [first.longitude, first.latitude], zoom: Math.max(map.getZoom(), 8) });
        });

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([first.longitude, first.latitude])
          .addTo(map);
        markersRef.current.push(marker);
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [groups, mapReady]);

  // One-shot initial center: GPS → current user's home → Terra Alta. Runs once
  // per mount when the map is ready and loozers have loaded.
  const didInitialCenterRef = useRef(false);
  useEffect(() => {
    if (!mapReady || !mapRef.current || didInitialCenterRef.current) return;
    if (loading) return;
    const map = mapRef.current;
    if (userLocation) {
      map.jumpTo({ center: [userLocation.lng, userLocation.lat], zoom: 8 });
    } else if (currentUserId) {
      const me = loozers.find((l) => l.id === currentUserId);
      if (me) {
        map.jumpTo({ center: [me.longitude, me.latitude], zoom: 7 });
      } else {
        map.jumpTo({ center: [TERRA_ALTA[1], TERRA_ALTA[0]], zoom: 6 });
      }
    } else {
      map.jumpTo({ center: [TERRA_ALTA[1], TERRA_ALTA[0]], zoom: 6 });
    }
    didInitialCenterRef.current = true;
  }, [mapReady, loading, userLocation, currentUserId, loozers]);

  // User pin + fly-to when nonce changes.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !userLocation) return;
    let cancelled = false;
    const map = mapRef.current;

    async function render() {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !userLocation) return;

      if (userMarkerRef.current) {
        userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
      } else {
        const el = document.createElement("div");
        el.className =
          "w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-md ring-4 ring-blue-500/30";
        userMarkerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat([userLocation.lng, userLocation.lat])
          .addTo(map);
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [userLocation, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !userLocation || !flyToUserNonce) return;
    mapRef.current.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 8 });
  }, [flyToUserNonce, userLocation, mapReady]);

  const sortedNearby = useMemo(() => {
    if (!userLocation) return [];
    return loozers
      .map((l) => ({
        ...l,
        distance: haversineMiles(userLocation, { lat: l.latitude, lng: l.longitude }),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 8);
  }, [loozers, userLocation]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="w-full bg-gray-100 border border-gray-200 rounded-xl overflow-hidden"
        style={{ height: "calc(100dvh - 280px)" }}
      />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Selected group popover */}
      {activeGroup && (
        <div
          className="absolute left-3 right-3 bottom-3 bg-white rounded-xl shadow-lg border border-gray-200 p-3 max-h-64 overflow-y-auto"
          style={{ zIndex: 20 }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {activeGroup[0].city}, {activeGroup[0].state}
              {userLocation && (
                <span className="ml-2 text-gray-400 normal-case">
                  · {formatDistance(haversineMiles(userLocation, { lat: activeGroup[0].latitude, lng: activeGroup[0].longitude }))} away
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={() => setActiveGroup(null)}
              className="text-gray-400 active:text-gray-600 text-xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="space-y-2">
            {activeGroup.map((l) => (
              <a
                key={l.id}
                href={`${basePath}/${l.id}`}
                className="flex items-center gap-3 p-2 rounded-lg active:bg-gray-50"
              >
                <div className="w-10 h-10 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {l.avatar_url ? (
                    <img src={l.avatar_url} alt={l.display_name} className="w-full h-full object-cover" />
                  ) : (
                    getInitials(l.display_name)
                  )}
                </div>
                <span className="text-sm font-medium text-gray-900">{l.display_name}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Nearest list when GPS active and no group selected */}
      {!activeGroup && sortedNearby.length > 0 && (
        <div
          className="absolute left-3 right-3 bottom-3 bg-white/95 backdrop-blur rounded-xl shadow-md border border-gray-200 px-2 py-2 overflow-x-auto"
          style={{ zIndex: 10 }}
        >
          <div className="flex gap-2">
            {sortedNearby.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  const group = groups.find((g) => g.some((x) => x.id === l.id));
                  if (group) setActiveGroup(group);
                  mapRef.current?.flyTo({ center: [l.longitude, l.latitude], zoom: 8 });
                }}
                className="flex flex-col items-center gap-1 min-w-[64px] px-1 py-1 rounded-lg active:bg-gray-100"
              >
                <div className="w-10 h-10 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center text-xs font-bold">
                  {l.avatar_url ? (
                    <img src={l.avatar_url} alt={l.display_name} className="w-full h-full object-cover" />
                  ) : (
                    getInitials(l.display_name)
                  )}
                </div>
                <span className="text-[10px] font-medium text-gray-900 leading-tight text-center max-w-[64px] truncate">
                  {l.display_name.split(" ")[0]}
                </span>
                <span className="text-[10px] text-gray-500">{formatDistance(l.distance)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
