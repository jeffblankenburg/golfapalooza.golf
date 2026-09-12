"use client";

import { useState, useEffect, useRef } from "react";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import { CourseHelpDrawer } from "@/components/v2/courses/CourseHelpDrawer";
import { computeIdealDriveDefault } from "@/lib/v2/courses/mapped-status";
import { getTeeColorClasses } from "@/lib/v2/tee-colors";

interface Coordinates {
  tee_latitude: number | null;
  tee_longitude: number | null;
  green_latitude: number | null;
  green_longitude: number | null;
  drive_latitude: number | null;
  drive_longitude: number | null;
  green_front_latitude: number | null;
  green_front_longitude: number | null;
  green_back_latitude: number | null;
  green_back_longitude: number | null;
  // Ordered polyline of [lat, lng] points defining the playable corridor.
  // Empty array or null = no center line set.
  center_line: [number, number][] | null;
}

type LatLng = [number, number];

function lineFeature(points: LatLng[]) {
  return {
    type: "Feature" as const,
    geometry: {
      type: "LineString" as const,
      coordinates: points.map(([lat, lng]) => [lng, lat]),
    },
    properties: {},
  };
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
  /** The tee being edited — shown in the header so it's clear which set of tees
   *  this hole's markers belong to (the tee picker is hidden behind the drawer). */
  teeName?: string;
  teeColor?: string | null;
  /** Previous hole's green coordinates, used as a smarter starting center
   *  when the current hole has no markers placed yet. */
  previousHoleGreen?: [number, number] | null;
  coordinates: Coordinates;
  onSave: (coords: Coordinates) => void;
  /** Present only when there's a next hole — save these markers, then advance. */
  onSaveNext?: (coords: Coordinates) => void;
  onClose: () => void;
}

function getBearing(from: [number, number], to: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(from[0]);
  const lat2 = toRad(to[0]);
  const dLng = toRad(to[1] - from[1]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function calcYards(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  const meters = R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return Math.round(meters * 1.09361);
}

type PlaceKind = "tee" | "green" | "drive" | "green_front" | "green_back";
const PLACE_TONES = {
  tee: { active: "bg-blue-600 text-white", ring: "ring-blue-300", set: "bg-blue-50 text-blue-700 border border-blue-200" },
  drive: { active: "bg-amber-500 text-white", ring: "ring-amber-300", set: "bg-amber-50 text-amber-700 border border-amber-200" },
  green: { active: "bg-green-600 text-white", ring: "ring-green-300", set: "bg-green-50 text-green-700 border border-green-200" },
};

export default function HoleMapEditor({
  holeNumber,
  courseId,
  courseLatitude,
  courseLongitude,
  courseAddress,
  courseName,
  courseCity,
  courseState,
  teeName,
  teeColor,
  previousHoleGreen,
  coordinates,
  onSave,
  onSaveNext,
  onClose,
}: HoleMapEditorProps) {
  const [placing, setPlacing] = useState<"tee" | "green" | "drive" | "green_front" | "green_back" | "center_line" | null>(null);
  const [centerLine, setCenterLine] = useState<LatLng[]>(coordinates.center_line || []);
  const centerLineRef = useRef<LatLng[]>(centerLine);
  centerLineRef.current = centerLine;
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
  const [drive, setDrive] = useState<[number, number] | null>(
    coordinates.drive_latitude != null && coordinates.drive_longitude != null
      ? [coordinates.drive_latitude, coordinates.drive_longitude]
      : null
  );
  const [greenFront, setGreenFront] = useState<[number, number] | null>(
    coordinates.green_front_latitude != null && coordinates.green_front_longitude != null
      ? [coordinates.green_front_latitude, coordinates.green_front_longitude]
      : null
  );
  const [greenBack, setGreenBack] = useState<[number, number] | null>(
    coordinates.green_back_latitude != null && coordinates.green_back_longitude != null
      ? [coordinates.green_back_latitude, coordinates.green_back_longitude]
      : null
  );
  const [geocodedCenter, setGeocodedCenter] = useState<[number, number] | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const teeMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const greenMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const driveMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const driveGhostRef = useRef<mapboxgl.Marker | null>(null);
  const greenFrontMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const greenBackMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const centerLineSourceRef = useRef<mapboxgl.GeoJSONSource | null>(null);
  const centerLineMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const placingRef = useRef(placing);
  placingRef.current = placing;

  const [helpOpen, setHelpOpen] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);

  // Issue #133. When no ideal-drive point has been saved yet but we know
  // the tee and green positions, render a "ghost" hint at the 250-yd
  // default so the editor shows what `Place Drive` will land on.
  const ghostDrive = !drive ? computeIdealDriveDefault(
    tee?.[0] ?? null,
    tee?.[1] ?? null,
    green?.[0] ?? null,
    green?.[1] ?? null,
  ) : null;

  // Geocode if no coordinates
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
            fetch(`/api/v2/courses/${courseId}`, {
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

  // Calculate distances
  const teeToGreen = tee && green ? calcYards(tee, green) : null;
  const teeToDrive = tee && drive ? calcYards(tee, drive) : null;
  const driveToGreen = drive && green ? calcYards(drive, green) : null;
  const greenDepth = greenFront && greenBack ? calcYards(greenFront, greenBack) : null;

  const center: [number, number] =
    tee ||
    green ||
    previousHoleGreen ||
    (courseLatitude != null && courseLongitude != null
      ? [courseLatitude, courseLongitude]
      : geocodedCenter || [40.0, -83.0]);

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

      const bearing = tee && green ? getBearing(tee, green) : 0;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [center[1], center[0]],
        zoom: tee || green || previousHoleGreen ? 17 : 15,
        bearing,
        attributionControl: false,
      });
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;

        // Fit bounds with same orientation as live scoring
        if (tee && green) {
          const bounds = new mapboxgl.LngLatBounds(
            [tee[1], tee[0]],
            [green[1], green[0]]
          );
          map.fitBounds(bounds, {
            padding: { top: 80, bottom: 80, left: 50, right: 50 },
            bearing,
            maxZoom: 18,
          });
        }

        if (tee) addMarker(mapboxgl, map, tee, "tee");
        if (green) addMarker(mapboxgl, map, green, "green");
        if (drive) addMarker(mapboxgl, map, drive, "drive");
        if (greenFront) addMarker(mapboxgl, map, greenFront, "green_front");
        if (greenBack) addMarker(mapboxgl, map, greenBack, "green_back");

        // Center-line line layer + numbered point markers. The polyline
        // sits beneath the markers so the dots remain readable.
        map.addSource("center-line", { type: "geojson", data: lineFeature(centerLineRef.current) });
        map.addLayer({
          id: "center-line-layer",
          type: "line",
          source: "center-line",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ec4899", "line-width": 4, "line-opacity": 0.7 },
        });
        centerLineSourceRef.current = map.getSource("center-line") as mapboxgl.GeoJSONSource;
        centerLineRef.current.forEach((p, i) => {
          centerLineMarkersRef.current.push(addCenterLinePointMarker(mapboxgl, map, p, i + 1));
        });

        map.on("click", (e) => {
          const latLng: [number, number] = [e.lngLat.lat, e.lngLat.lng];
          const mode = placingRef.current;
          if (mode === "center_line") {
            const next = [...centerLineRef.current, latLng];
            centerLineRef.current = next;
            setCenterLine(next);
            centerLineSourceRef.current?.setData(lineFeature(next));
            centerLineMarkersRef.current.push(addCenterLinePointMarker(mapboxgl, map, latLng, next.length));
            return;
          }
          const handlers: Record<string, () => void> = {
            tee: () => { setTee(latLng); teeMarkerRef.current?.remove(); addMarker(mapboxgl, map, latLng, "tee"); },
            green: () => { setGreen(latLng); greenMarkerRef.current?.remove(); addMarker(mapboxgl, map, latLng, "green"); },
            drive: () => { setDrive(latLng); driveMarkerRef.current?.remove(); addMarker(mapboxgl, map, latLng, "drive"); },
            green_front: () => { setGreenFront(latLng); greenFrontMarkerRef.current?.remove(); addMarker(mapboxgl, map, latLng, "green_front"); },
            green_back: () => { setGreenBack(latLng); greenBackMarkerRef.current?.remove(); addMarker(mapboxgl, map, latLng, "green_back"); },
          };
          if (mode && handlers[mode]) {
            handlers[mode]();
            setPlacing(null);
          }
        });
      });

      function addCenterLinePointMarker(gl: typeof mapboxgl, m: mapboxgl.Map, pos: LatLng, n: number) {
        const el = document.createElement("div");
        el.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="7" fill="#ec4899" stroke="white" stroke-width="2"/>
          <text x="9" y="12.5" font-size="9" font-weight="700" text-anchor="middle" fill="white">${n}</text>
        </svg>`;
        return new gl.Marker({ element: el, anchor: "center" })
          .setLngLat([pos[1], pos[0]])
          .addTo(m);
      }

      function makeDotEl(color: string, label: string, hollow = false) {
        const el = document.createElement("div");
        el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;">
          <svg width="24" height="24" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8" fill="${hollow ? "none" : color}" stroke="${hollow ? color : "white"}" stroke-width="${hollow ? "3" : "2.5"}"/>
          </svg>
          <div style="margin-top:1px;background:rgba(0,0,0,0.7);color:white;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;white-space:nowrap;">${label}</div>
        </div>`;
        return el;
      }

      function addMarker(gl: typeof mapboxgl, m: mapboxgl.Map, pos: [number, number], type: "tee" | "green" | "drive" | "green_front" | "green_back") {
        const configs = {
          tee: { color: "#2563eb", label: "Tee", hollow: false },
          green: { color: "#16a34a", label: "Green", hollow: false },
          drive: { color: "#f59e0b", label: "Drive", hollow: true },
          green_front: { color: "#16a34a", label: "Front", hollow: true },
          green_back: { color: "#16a34a", label: "Back", hollow: true },
        };
        const cfg = configs[type];
        const el = makeDotEl(cfg.color, cfg.label, cfg.hollow);
        const marker = new gl.Marker({ element: el, anchor: "center" })
          .setLngLat([pos[1], pos[0]])
          .addTo(m);
        if (type === "tee") teeMarkerRef.current = marker;
        else if (type === "green") greenMarkerRef.current = marker;
        else if (type === "drive") driveMarkerRef.current = marker;
        else if (type === "green_front") greenFrontMarkerRef.current = marker;
        else if (type === "green_back") greenBackMarkerRef.current = marker;
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

  // Issue #133. Ghost ideal-drive marker: a translucent hint at the 250-yd
  // default landing zone whenever the user hasn't placed a real one but
  // we have tee + green to compute against. Keeps in sync with whatever
  // tee/green moves the user makes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Tear down any existing ghost so we can redraw or skip.
    driveGhostRef.current?.remove();
    driveGhostRef.current = null;

    if (drive || !ghostDrive) return;

    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !mapRef.current) return;
      const el = document.createElement("div");
      el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;opacity:0.6;">
        <svg width="24" height="24" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="3 2"/>
          <text x="12" y="15" font-size="10" font-weight="700" text-anchor="middle" fill="#f59e0b">?</text>
        </svg>
        <div style="margin-top:1px;background:rgba(245,158,11,0.85);color:white;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;white-space:nowrap;">250y default</div>
      </div>`;
      driveGhostRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([ghostDrive.lng, ghostDrive.lat])
        .addTo(mapRef.current);
    })();

    return () => {
      cancelled = true;
      driveGhostRef.current?.remove();
      driveGhostRef.current = null;
    };
  }, [ghostDrive, drive]);

  function collectCoords(): Coordinates {
    return {
      tee_latitude: tee ? tee[0] : null,
      tee_longitude: tee ? tee[1] : null,
      green_latitude: green ? green[0] : null,
      green_longitude: green ? green[1] : null,
      drive_latitude: drive ? drive[0] : null,
      drive_longitude: drive ? drive[1] : null,
      green_front_latitude: greenFront ? greenFront[0] : null,
      green_front_longitude: greenFront ? greenFront[1] : null,
      green_back_latitude: greenBack ? greenBack[0] : null,
      green_back_longitude: greenBack ? greenBack[1] : null,
      center_line: centerLine.length > 0 ? centerLine : null,
    };
  }
  function handleSave() { onSave(collectCoords()); }
  function handleSaveNext() { onSaveNext?.(collectCoords()); }

  // Which markers differ from what we opened with (for the discard warning).
  function changedPoints(): string[] {
    const c = coordinates;
    const rows: [string, [number | null, number | null], [number | null, number | null]][] = [
      ["Tee", [tee?.[0] ?? null, tee?.[1] ?? null], [c.tee_latitude, c.tee_longitude]],
      ["Green Center", [green?.[0] ?? null, green?.[1] ?? null], [c.green_latitude, c.green_longitude]],
      ["Green Front", [greenFront?.[0] ?? null, greenFront?.[1] ?? null], [c.green_front_latitude, c.green_front_longitude]],
      ["Green Back", [greenBack?.[0] ?? null, greenBack?.[1] ?? null], [c.green_back_latitude, c.green_back_longitude]],
      ["Drive", [drive?.[0] ?? null, drive?.[1] ?? null], [c.drive_latitude, c.drive_longitude]],
    ];
    const out: string[] = [];
    for (const [label, cur, init] of rows) {
      const hasCur = cur[0] != null && cur[1] != null;
      const hadInit = init[0] != null && init[1] != null;
      if (hasCur && !hadInit) out.push(`${label} added`);
      else if (!hasCur && hadInit) out.push(`${label} removed`);
      else if (hasCur && hadInit && (cur[0] !== init[0] || cur[1] !== init[1])) out.push(`${label} moved`);
    }
    return out;
  }
  function attemptClose() {
    if (changedPoints().length > 0) setShowDiscard(true);
    else onClose();
  }

  const placeBtn = (kind: PlaceKind, label: string, isSet: boolean, tone: typeof PLACE_TONES.tee, small = false) => (
    <button
      type="button"
      onClick={() => setPlacing(placing === kind ? null : kind)}
      className={`flex-1 rounded-xl font-semibold transition-colors ${small ? "py-1.5 text-xs" : "py-2 text-sm"} ${
        placing === kind ? `${tone.active} ring-2 ${tone.ring}` : isSet ? tone.set : "bg-gray-100 text-gray-600"
      }`}
    >
      {placing === kind ? "Tap map…" : label}
    </button>
  );

  function handleClear() {
    setTee(null);
    setGreen(null);
    setDrive(null);
    setGreenFront(null);
    setGreenBack(null);
    teeMarkerRef.current?.remove();
    greenMarkerRef.current?.remove();
    driveMarkerRef.current?.remove();
    greenFrontMarkerRef.current?.remove();
    greenBackMarkerRef.current?.remove();
    teeMarkerRef.current = null;
    greenMarkerRef.current = null;
    driveMarkerRef.current = null;
    handleClearCenterLine();
  }

  function handleClearCenterLine() {
    centerLineRef.current = [];
    setCenterLine([]);
    centerLineSourceRef.current?.setData(lineFeature([]));
    centerLineMarkersRef.current.forEach((m) => m.remove());
    centerLineMarkersRef.current = [];
  }

  return (
    <div className="fixed top-14 left-0 right-0 z-50 flex items-end justify-center bottom-[calc(4rem+env(safe-area-inset-bottom))]">
      <div className="absolute inset-0 bg-[#17211d]/20 backdrop-blur-[6px]" onClick={attemptClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up flex flex-col" style={{ maxHeight: "90vh" }}>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 whitespace-nowrap shrink-0">Hole {holeNumber} Map</h2>
            {teeName && (() => {
              const tc = getTeeColorClasses(teeColor ?? null);
              return (
                <span className="flex items-center gap-1.5 min-w-0 text-xs text-gray-500">
                  <span className={`inline-block w-2.5 h-2.5 shrink-0 rounded-full ${tc.bg}`}
                    style={tc.isGradient ? { background: tc.gradientHex! } : tc.hex ? { background: tc.hex } : undefined} />
                  <span className="truncate">{teeName} tees</span>
                </span>
              );
            })()}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="How to map this hole"
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 active:bg-gray-100"
            >
              <span className="text-base font-semibold">?</span>
            </button>
            <button
              type="button"
              onClick={attemptClose}
              aria-label="Close"
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 active:bg-gray-100"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-3 border-b border-gray-100 shrink-0">
          {/* Top row: Tee + Drive. Bottom row: the three green points. */}
          <div className="flex gap-2">
            {placeBtn("tee", "Tee", !!tee, PLACE_TONES.tee)}
            {placeBtn("drive", "Drive", !!drive, PLACE_TONES.drive)}
          </div>
          <div className="flex gap-2 mt-2">
            {placeBtn("green_front", "Green Front", !!greenFront, PLACE_TONES.green, true)}
            {placeBtn("green", "Green Center", !!green, PLACE_TONES.green, true)}
            {placeBtn("green_back", "Green Back", !!greenBack, PLACE_TONES.green, true)}
          </div>
          {/* Center-line UI intentionally hidden — issue #133 follow-up.
              Existing center_line data still round-trips through save and
              renders on the map (the GeoJSON source/layer init below stays
              in place). When we re-enable, restore the button block here. */}
          {(teeToGreen != null || teeToDrive != null || greenDepth != null) && (
            <div className="flex flex-wrap justify-center gap-3 text-xs text-gray-500 mt-2">
              {teeToGreen != null && <span>Tee→Green: {teeToGreen}y</span>}
              {teeToDrive != null && <span>Tee→Drive: {teeToDrive}y</span>}
              {driveToGreen != null && <span>Drive→Green: {driveToGreen}y</span>}
              {greenDepth != null && <span className="text-green-600 font-medium">Green depth: {greenDepth}y</span>}
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

        <div className="px-6 py-4 border-t border-gray-100 flex flex-col gap-2 shrink-0">
          {onSaveNext && (
            <button
              onClick={handleSaveNext}
              className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold active:opacity-80"
            >
              Save &amp; Next Hole
            </button>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className={`flex-1 py-3 rounded-xl font-semibold active:opacity-80 ${
                onSaveNext ? "bg-green-50 text-green-700 border border-green-200" : "bg-green-600 text-white"
              }`}
            >
              Save &amp; Close
            </button>
            {(tee || green || drive) && (
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
      <CourseHelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ConfirmModal
        open={showDiscard}
        title="Discard map changes?"
        message={
          <>
            These won&apos;t be saved:
            <ul className="mt-1.5 list-disc pl-5 space-y-0.5">
              {changedPoints().map((c) => <li key={c}>{c}</li>)}
            </ul>
          </>
        }
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => { setShowDiscard(false); onClose(); }}
        onCancel={() => setShowDiscard(false)}
      />
    </div>
  );
}
