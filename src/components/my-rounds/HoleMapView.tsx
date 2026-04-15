"use client";

import { useEffect, useRef, useState } from "react";
import { TEE_HEX_COLORS } from "@/lib/utils/tee-colors";

interface HoleMapViewProps {
  teeLatLng: [number, number];
  greenLatLng: [number, number] | null;
  driveLatLng: [number, number] | null;
  greenFrontLatLng: [number, number] | null;
  greenBackLatLng: [number, number] | null;
  holeNumber: number;
  par: number;
  teeColor?: string | null;
  showUserLocation?: boolean;
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

/** Given a center point and a bearing (degrees), return two points forming a
 *  perpendicular line of `widthYards` centered on `center`. */
function perpendicularLine(
  center: [number, number],
  bearingDeg: number,
  widthYards: number
): [[number, number], [number, number]] {
  const meters = (widthYards / 1.09361) / 2;
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(center[0]);
  const lng1 = toRad(center[1]);
  const d = meters / R;

  function project(brng: number): [number, number] {
    const b = toRad(brng);
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
    const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    return [toDeg(lat2), toDeg(lng2)];
  }

  // Perpendicular bearings (90 degrees left and right)
  const left = (bearingDeg + 270) % 360;
  const right = (bearingDeg + 90) % 360;
  return [project(left), project(right)];
}

export default function HoleMapView({
  teeLatLng,
  greenLatLng,
  driveLatLng,
  greenFrontLatLng,
  greenBackLatLng,
  holeNumber,
  par,
  teeColor,
  showUserLocation = false,
}: HoleMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [driveYards, setDriveYards] = useState<{ toTee: number; toGreen: number; toFront: number | null; toBack: number | null } | null>(null);

  // Stable refs
  const teeRef = useRef(teeLatLng);
  const greenRef = useRef(greenLatLng);
  const driveRef = useRef(driveLatLng);
  const greenFrontRef = useRef(greenFrontLatLng);
  const greenBackRef = useRef(greenBackLatLng);
  teeRef.current = teeLatLng;
  greenRef.current = greenLatLng;
  driveRef.current = driveLatLng;
  greenFrontRef.current = greenFrontLatLng;
  greenBackRef.current = greenBackLatLng;

  const teeColorRef = useRef(teeColor);
  teeColorRef.current = teeColor;

  const greenDepth = greenFrontLatLng && greenBackLatLng ? calcYards(greenFrontLatLng, greenBackLatLng) : null;

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    const tee = teeRef.current;
    const green = greenRef.current;
    // For par 3, default the circle to the green if no drive point set
    const initialDrive = driveRef.current || (par <= 3 && green ? green : null);

    async function init() {
      const mapboxgl = (await import("mapbox-gl")).default;
      // @ts-expect-error CSS import has no types
      await import("mapbox-gl/dist/mapbox-gl.css");

      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

      const center: [number, number] = green
        ? [(tee[1] + green[1]) / 2, (tee[0] + green[0]) / 2]
        : [tee[1], tee[0]];

      const bearing = green ? getBearing(tee, green) : 0;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center,
        zoom: 17,
        bearing,
        pitch: 0,
        attributionControl: false,
      });

      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;
        setLoaded(true);

        // Fit bounds
        if (green) {
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

        // Tee dot (colored by tee box)
        const teeHex = TEE_HEX_COLORS[teeColorRef.current || ""] || "#2563eb";
        const teeEl = document.createElement("div");
        teeEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="6" fill="${teeHex}" stroke="white" stroke-width="2.5"/>
        </svg>`;
        teeEl.style.cursor = "default";
        new mapboxgl.Marker({ element: teeEl, anchor: "center" })
          .setLngLat([tee[1], tee[0]])
          .addTo(map);

        // Green dot
        if (green) {
          const greenEl = document.createElement("div");
          greenEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18">
            <circle cx="9" cy="9" r="6" fill="#16a34a" stroke="white" stroke-width="2.5"/>
          </svg>`;
          greenEl.style.cursor = "default";
          new mapboxgl.Marker({ element: greenEl, anchor: "center" })
            .setLngLat([green[1], green[0]])
            .addTo(map);
        }

        // Front/back green lines (perpendicular to line of play)
        const playBearing = green ? getBearing(tee, green) : 0;
        const gf = greenFrontRef.current;
        const gb = greenBackRef.current;

        if (gf) {
          const [fl, fr] = perpendicularLine(gf, playBearing, 20);
          map.addSource("green-front-line", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[fl[1], fl[0]], [fr[1], fr[0]]] } },
          });
          map.addLayer({
            id: "green-front-line",
            type: "line",
            source: "green-front-line",
            paint: { "line-color": "#ffffff", "line-width": 2 },
          });
        }

        if (gb) {
          const [bl, br] = perpendicularLine(gb, playBearing, 20);
          map.addSource("green-back-line", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[bl[1], bl[0]], [br[1], br[0]]] } },
          });
          map.addLayer({
            id: "green-back-line",
            type: "line",
            source: "green-back-line",
            paint: { "line-color": "#ffffff", "line-width": 2 },
          });
        }

        // Distance label helper
        function addDistanceLabel(id: string, from: [number, number], to: [number, number]) {
          const midLat = (from[0] + to[0]) / 2;
          const midLng = (from[1] + to[1]) / 2;
          const yards = calcYards(from, to);

          map.addSource(id + "-line", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: [[from[1], from[0]], [to[1], to[0]]],
              },
            },
          });
          map.addLayer({
            id: id + "-line",
            type: "line",
            source: id + "-line",
            paint: {
              "line-color": "rgba(255,255,255,0.6)",
              "line-width": 1.5,
              "line-dasharray": [4, 4],
            },
          });

          // Label
          const labelEl = document.createElement("div");
          labelEl.className = `map-distance-label-${id}`;
          labelEl.innerHTML = `<div style="background:rgba(0,0,0,0.75);color:white;font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;white-space:nowrap;">${yards}y</div>`;
          labelEl.style.cursor = "default";
          new mapboxgl.Marker({ element: labelEl, anchor: "center" })
            .setLngLat([midLng, midLat])
            .addTo(map);

          return { yards, labelEl, midLat, midLng };
        }

        // Draggable drive circle
        if (initialDrive && green) {
          const driveEl = document.createElement("div");
          driveEl.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8" fill="none" stroke="#f59e0b" stroke-width="3"/>
          </svg>`;
          driveEl.style.cursor = "grab";

          const driveMarker = new mapboxgl.Marker({ element: driveEl, anchor: "center", draggable: true })
            .setLngLat([initialDrive[1], initialDrive[0]])
            .addTo(map);

          // Initial lines
          const teeLineInfo = addDistanceLabel("tee-drive", tee, initialDrive);
          const greenLineInfo = addDistanceLabel("drive-green", initialDrive, green);

          const frontYards = greenFrontRef.current ? calcYards(initialDrive, greenFrontRef.current) : null;
          const backYards = greenBackRef.current ? calcYards(initialDrive, greenBackRef.current) : null;
          setDriveYards({ toTee: teeLineInfo.yards, toGreen: greenLineInfo.yards, toFront: frontYards, toBack: backYards });

          // Update on drag
          driveMarker.on("drag", () => {
            const lngLat = driveMarker.getLngLat();
            const drivePos: [number, number] = [lngLat.lat, lngLat.lng];

            // Update tee-drive line
            const teeLineSource = map.getSource("tee-drive-line") as mapboxgl.GeoJSONSource;
            if (teeLineSource) {
              teeLineSource.setData({
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: [[tee[1], tee[0]], [drivePos[1], drivePos[0]]],
                },
              });
            }

            // Update drive-green line
            const greenLineSource = map.getSource("drive-green-line") as mapboxgl.GeoJSONSource;
            if (greenLineSource) {
              greenLineSource.setData({
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: [[drivePos[1], drivePos[0]], [green[1], green[0]]],
                },
              });
            }

            // Update labels
            const teeDriveYards = calcYards(tee, drivePos);
            const driveGreenYards = calcYards(drivePos, green);

            const teeLabelEl = containerRef.current?.querySelector(".map-distance-label-tee-drive div") as HTMLElement;
            if (teeLabelEl) teeLabelEl.textContent = `${teeDriveYards}y`;

            const greenLabelEl = containerRef.current?.querySelector(".map-distance-label-drive-green div") as HTMLElement;
            if (greenLabelEl) greenLabelEl.textContent = `${driveGreenYards}y`;

            const frontY = greenFrontRef.current ? calcYards(drivePos, greenFrontRef.current) : null;
            const backY = greenBackRef.current ? calcYards(drivePos, greenBackRef.current) : null;
            setDriveYards({ toTee: teeDriveYards, toGreen: driveGreenYards, toFront: frontY, toBack: backY });
          });
        }

        // User location
        if (showUserLocation) {
          map.addControl(
            new mapboxgl.GeolocateControl({
              positionOptions: { enableHighAccuracy: true },
              trackUserLocation: true,
              showUserHeading: true,
            })
          );
          setTimeout(() => {
            const geoBtn = containerRef.current?.querySelector(".mapboxgl-ctrl-geolocate") as HTMLButtonElement;
            geoBtn?.click();
          }, 500);
        }
      });
    }

    init();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holeNumber]);

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ minHeight: "200px" }}>
      {!loaded && (
        <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
          Loading map...
        </div>
      )}
      {loaded && (driveYards || greenDepth) && (
        <div className="absolute top-2 left-2 z-10 bg-black/60 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg space-y-0.5">
          {driveYards && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: TEE_HEX_COLORS[teeColor || ""] || "#2563eb" }} />
              <span>{driveYards.toTee}y</span>
              <span className="w-2 h-2 rounded-full border-2 border-amber-400 inline-block" />
              <span>{driveYards.toGreen}y</span>
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            </div>
          )}
          {driveYards && (driveYards.toFront != null || driveYards.toBack != null) && (
            <div className="flex items-center gap-2 text-green-300">
              {driveYards.toFront != null && <span>Front: {driveYards.toFront}y</span>}
              {driveYards.toBack != null && <span>Back: {driveYards.toBack}y</span>}
            </div>
          )}
          {greenDepth != null && (
            <div className="text-green-300">Depth: {greenDepth}y</div>
          )}
        </div>
      )}
    </div>
  );
}
