"use client";

import { useState, useEffect, useRef } from "react";

interface Coordinates {
  tee_latitude: number | null;
  tee_longitude: number | null;
  green_latitude: number | null;
  green_longitude: number | null;
}

interface HoleMapEditorProps {
  holeNumber: number;
  courseId: string;
  courseLatitude: number | null;
  courseLongitude: number | null;
  courseAddress: string | null;
  courseName: string | null;
  courseCity: string | null;
  courseState: string | null;
  coordinates: Coordinates;
  onSave: (coords: Coordinates) => void;
  onClose: () => void;
}

export default function HoleMapEditor({
  holeNumber,
  courseId,
  courseLatitude,
  courseLongitude,
  courseAddress,
  courseName,
  courseCity,
  courseState,
  coordinates,
  onSave,
  onClose,
}: HoleMapEditorProps) {
  const [placing, setPlacing] = useState<"tee" | "green" | null>(null);
  const [tee, setTee] = useState<[number, number] | null>(
    coordinates.tee_latitude != null && coordinates.tee_longitude != null
      ? [coordinates.tee_latitude, coordinates.tee_longitude]
      : null
  );
  const [green, setGreen] = useState<[number, number] | null>(
    coordinates.green_latitude != null && coordinates.green_longitude != null
      ? [coordinates.green_latitude, coordinates.green_longitude]
      : null
  );
  const [geocodedCenter, setGeocodedCenter] = useState<[number, number] | null>(null);
  const [distanceYards, setDistanceYards] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const teeMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const greenMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const placingRef = useRef(placing);
  placingRef.current = placing;

  // Geocode if no coordinates — use Mapbox Geocoding API
  useEffect(() => {
    if (courseLatitude != null && courseLongitude != null) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;

    const queries: string[] = [];
    if (courseAddress && courseCity && courseState) queries.push(`${courseAddress}, ${courseCity}, ${courseState}`);
    if (courseName && courseCity && courseState) queries.push(`${courseName}, ${courseCity}, ${courseState}`);
    if (courseCity && courseState) queries.push(`${courseCity}, ${courseState}`);
    if (queries.length === 0) return;

    async function tryGeocode() {
      for (const query of queries) {
        try {
          const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&country=us&limit=1`
          );
          const data = await res.json();
          if (data.features?.length > 0) {
            const [lng, lat] = data.features[0].center;
            setGeocodedCenter([lat, lng]);
            // Save back to course
            fetch(`/api/courses/${courseId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ latitude: lat, longitude: lng }),
            }).catch(() => {});
            return;
          }
        } catch { /* try next */ }
      }
    }
    tryGeocode();
  }, [courseLatitude, courseLongitude, courseAddress, courseName, courseCity, courseState, courseId]);

  // Calculate distance
  useEffect(() => {
    if (tee && green) {
      const R = 6371000;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(green[0] - tee[0]);
      const dLng = toRad(green[1] - tee[1]);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(tee[0])) * Math.cos(toRad(green[0])) * Math.sin(dLng / 2) ** 2;
      const meters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      setDistanceYards(Math.round(meters * 1.09361));
    } else {
      setDistanceYards(null);
    }
  }, [tee, green]);

  const center: [number, number] = tee || green || (
    courseLatitude != null && courseLongitude != null
      ? [courseLatitude, courseLongitude]
      : geocodedCenter || [40.0, -83.0]
  );

  // Init Mapbox
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
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [center[1], center[0]],
        zoom: tee || green ? 17 : 15,
        attributionControl: false,
      });
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;

        // Add existing markers
        if (tee) addTeeMarker(mapboxgl, map, tee);
        if (green) addGreenMarker(mapboxgl, map, green);

        // Click to place
        map.on("click", (e) => {
          const latLng: [number, number] = [e.lngLat.lat, e.lngLat.lng];
          if (placingRef.current === "tee") {
            setTee(latLng);
            setPlacing(null);
            teeMarkerRef.current?.remove();
            addTeeMarker(mapboxgl, map, latLng);
          } else if (placingRef.current === "green") {
            setGreen(latLng);
            setPlacing(null);
            greenMarkerRef.current?.remove();
            addGreenMarker(mapboxgl, map, latLng);
          }
        });
      });

      function makeCrosshairEl(color: string, label: string) {
        const el = document.createElement("div");
        el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;">
          <svg width="36" height="36" viewBox="0 0 36 36">
            <line x1="18" y1="0" x2="18" y2="14" stroke="${color}" stroke-width="2" stroke-opacity="0.8"/>
            <line x1="18" y1="22" x2="18" y2="36" stroke="${color}" stroke-width="2" stroke-opacity="0.8"/>
            <line x1="0" y1="18" x2="14" y2="18" stroke="${color}" stroke-width="2" stroke-opacity="0.8"/>
            <line x1="22" y1="18" x2="36" y2="18" stroke="${color}" stroke-width="2" stroke-opacity="0.8"/>
            <circle cx="18" cy="18" r="4" fill="${color}" stroke="white" stroke-width="2"/>
          </svg>
          <div style="margin-top:2px;background:${color};color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;white-space:nowrap;">${label}</div>
        </div>`;
        return el;
      }

      function addTeeMarker(gl: typeof mapboxgl, m: mapboxgl.Map, pos: [number, number]) {
        const el = makeCrosshairEl("#2563eb", "Tee");
        const marker = new gl.Marker({ element: el, anchor: "center" })
          .setLngLat([pos[1], pos[0]])
          .addTo(m);
        teeMarkerRef.current = marker;
      }

      function addGreenMarker(gl: typeof mapboxgl, m: mapboxgl.Map, pos: [number, number]) {
        const el = makeCrosshairEl("#16a34a", "Green");
        const marker = new gl.Marker({ element: el, anchor: "center" })
          .setLngLat([pos[1], pos[0]])
          .addTo(m);
        greenMarkerRef.current = marker;
      }
    }

    init();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geocodedCenter]);

  function handleSave() {
    onSave({
      tee_latitude: tee ? tee[0] : null,
      tee_longitude: tee ? tee[1] : null,
      green_latitude: green ? green[0] : null,
      green_longitude: green ? green[1] : null,
    });
  }

  function handleClear() {
    setTee(null);
    setGreen(null);
    teeMarkerRef.current?.remove();
    greenMarkerRef.current?.remove();
    teeMarkerRef.current = null;
    greenMarkerRef.current = null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up flex flex-col" style={{ maxHeight: "90vh" }}>
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Hole {holeNumber} Map</h2>
          <p className="text-sm text-gray-500 mt-1">
            Tap a button, then tap the map to place the marker.
          </p>
        </div>

        <div className="px-6 py-3 border-b border-gray-100 shrink-0">
          <div className="flex gap-2">
            <button
              onClick={() => setPlacing(placing === "tee" ? null : "tee")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                placing === "tee"
                  ? "bg-blue-600 text-white ring-2 ring-blue-300"
                  : tee
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-gray-100 text-gray-600"
              }`}
            >
              {placing === "tee" ? "Tap map..." : tee ? "Move Tee" : "Place Tee"}
            </button>
            <button
              onClick={() => setPlacing(placing === "green" ? null : "green")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                placing === "green"
                  ? "bg-green-600 text-white ring-2 ring-green-300"
                  : green
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-gray-100 text-gray-600"
              }`}
            >
              {placing === "green" ? "Tap map..." : green ? "Move Green" : "Place Green"}
            </button>
          </div>
          {distanceYards != null && (
            <div className="text-center text-xs text-gray-500 mt-2">
              Tee to green: ~{distanceYards} yards
            </div>
          )}
        </div>

        <div className="shrink-0" style={{ height: "50vh" }}>
          <div
            ref={containerRef}
            className="w-full h-full"
            style={{ cursor: placing ? "crosshair" : "grab" }}
          />
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2 shrink-0">
          <button
            onClick={handleSave}
            className="flex-1 py-3 bg-green-600 text-white rounded-xl font-semibold active:opacity-80"
          >
            Save Markers
          </button>
          {(tee || green) && (
            <button
              onClick={handleClear}
              className="px-4 py-3 border border-gray-300 rounded-xl font-semibold text-gray-600 active:bg-gray-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
