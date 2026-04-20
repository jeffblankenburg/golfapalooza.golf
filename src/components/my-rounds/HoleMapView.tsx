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
}: HoleMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [driveYards, setDriveYards] = useState<{ toOrigin: number; toGreen: number; toFront: number | null; toBack: number | null } | null>(null);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

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

  // Cross-effect handles: set during map init, read from GPS effect.
  // `applyOriginRef` rewires the first dotted segment to a new origin point,
  // so GPS updates and drive-drag updates can share one code path.
  const applyOriginRef = useRef<((origin: [number, number]) => void) | null>(null);
  const currentDriveRef = useRef<[number, number] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMarkerRef = useRef<any>(null);

  const gpsEnabledRef = useRef(gpsEnabled);
  gpsEnabledRef.current = gpsEnabled;
  const userPosRef = useRef(userPos);
  userPosRef.current = userPos;

  const greenDepth = greenFrontLatLng && greenBackLatLng ? calcYards(greenFrontLatLng, greenBackLatLng) : null;

  // ───────────────────────── Map init (per hole) ─────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    setLoaded(false);
    applyOriginRef.current = null;
    currentDriveRef.current = null;
    userMarkerRef.current = null;

    const tee = teeRef.current;
    const green = greenRef.current;
    const initialDrive = driveRef.current || (par <= 3 && green ? green : null);

    async function init() {
      const mapboxgl = (await import("mapbox-gl")).default;
      // @ts-expect-error CSS import has no types
      await import("mapbox-gl/dist/mapbox-gl.css");

      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

      const bearing = green ? getBearing(tee, green) : 0;

      const mapOptions: mapboxgl.MapOptions = {
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        pitch: 0,
        attributionControl: false,
      };

      if (green) {
        const bounds = new mapboxgl.LngLatBounds([tee[1], tee[0]], [green[1], green[0]]);
        Object.assign(mapOptions, {
          bounds,
          fitBoundsOptions: {
            padding: { top: 40, bottom: 40, left: 30, right: 30 },
            bearing,
            maxZoom: 19,
          },
        });
      } else {
        Object.assign(mapOptions, {
          center: [tee[1], tee[0]] as [number, number],
          zoom: 17,
          bearing,
        });
      }

      const map = new mapboxgl.Map(mapOptions);
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;

        // Tee marker (static reference; not connected to the dotted chain when GPS is on)
        const teeHex = TEE_HEX_COLORS[teeColorRef.current || ""] || "#2563eb";
        const teeEl = document.createElement("div");
        teeEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="6" fill="${teeHex}" stroke="white" stroke-width="2.5"/>
        </svg>`;
        teeEl.style.cursor = "default";
        new mapboxgl.Marker({ element: teeEl, anchor: "center" })
          .setLngLat([tee[1], tee[0]])
          .addTo(map);

        // Green marker
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

        // Front/back green perpendicular lines
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

        function addDistanceLabel(id: string, from: [number, number], to: [number, number]) {
          const midLat = (from[0] + to[0]) / 2;
          const midLng = (from[1] + to[1]) / 2;
          const yards = calcYards(from, to);

          map.addSource(id + "-line", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: [[from[1], from[0]], [to[1], to[0]]] },
            },
          });
          map.addLayer({
            id: id + "-line",
            type: "line",
            source: id + "-line",
            paint: { "line-color": "rgba(255,255,255,0.6)", "line-width": 1.5, "line-dasharray": [4, 4] },
          });

          const labelEl = document.createElement("div");
          labelEl.className = `map-distance-label-${id}`;
          labelEl.innerHTML = `<div style="background:rgba(0,0,0,0.75);color:white;font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;white-space:nowrap;">${yards}y</div>`;
          labelEl.style.cursor = "default";
          const labelMarker = new mapboxgl.Marker({ element: labelEl, anchor: "center" })
            .setLngLat([midLng, midLat])
            .addTo(map);

          return { yards, labelEl, labelMarker };
        }

        // Draggable drive circle + first/second dotted segments
        if (initialDrive && green) {
          const driveEl = document.createElement("div");
          driveEl.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8" fill="none" stroke="#f59e0b" stroke-width="3"/>
          </svg>`;
          driveEl.style.cursor = "grab";

          const driveMarker = new mapboxgl.Marker({ element: driveEl, anchor: "center", draggable: true })
            .setLngLat([initialDrive[1], initialDrive[0]])
            .addTo(map);

          // Origin defaults to tee; GPS effect swaps this out when enabled.
          const startingOrigin: [number, number] =
            gpsEnabledRef.current && userPosRef.current
              ? [userPosRef.current.lat, userPosRef.current.lng]
              : tee;

          const originLineInfo = addDistanceLabel("tee-drive", startingOrigin, initialDrive);
          const greenLineInfo = addDistanceLabel("drive-green", initialDrive, green);

          currentDriveRef.current = initialDrive;

          const frontYards = greenFrontRef.current ? calcYards(initialDrive, greenFrontRef.current) : null;
          const backYards = greenBackRef.current ? calcYards(initialDrive, greenBackRef.current) : null;
          setDriveYards({
            toOrigin: originLineInfo.yards,
            toGreen: greenLineInfo.yards,
            toFront: frontYards,
            toBack: backYards,
          });

          // Rewire first segment (origin → drive). Called from:
          //   • drag handler (drive pos changed)
          //   • GPS watcher (origin changed)
          function rewire(origin: [number, number], drivePos: [number, number]) {
            const originLineSource = map.getSource("tee-drive-line") as mapboxgl.GeoJSONSource | undefined;
            if (originLineSource) {
              originLineSource.setData({
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: [[origin[1], origin[0]], [drivePos[1], drivePos[0]]] },
              });
            }
            const greenLineSource = map.getSource("drive-green-line") as mapboxgl.GeoJSONSource | undefined;
            if (greenLineSource) {
              greenLineSource.setData({
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: [[drivePos[1], drivePos[0]], [green![1], green![0]]] },
              });
            }

            const toOrigin = calcYards(origin, drivePos);
            const toGreen = calcYards(drivePos, green!);

            const originLabelEl = containerRef.current?.querySelector(".map-distance-label-tee-drive div") as HTMLElement;
            if (originLabelEl) originLabelEl.textContent = `${toOrigin}y`;
            originLineInfo.labelMarker.setLngLat([
              (origin[1] + drivePos[1]) / 2,
              (origin[0] + drivePos[0]) / 2,
            ]);

            const greenLabelEl = containerRef.current?.querySelector(".map-distance-label-drive-green div") as HTMLElement;
            if (greenLabelEl) greenLabelEl.textContent = `${toGreen}y`;
            greenLineInfo.labelMarker.setLngLat([
              (drivePos[1] + green![1]) / 2,
              (drivePos[0] + green![0]) / 2,
            ]);

            const frontY = greenFrontRef.current ? calcYards(drivePos, greenFrontRef.current) : null;
            const backY = greenBackRef.current ? calcYards(drivePos, greenBackRef.current) : null;
            setDriveYards({ toOrigin, toGreen, toFront: frontY, toBack: backY });
          }

          applyOriginRef.current = (origin) => {
            if (!currentDriveRef.current) return;
            rewire(origin, currentDriveRef.current);
          };

          driveMarker.on("drag", () => {
            const lngLat = driveMarker.getLngLat();
            const drivePos: [number, number] = [lngLat.lat, lngLat.lng];
            currentDriveRef.current = drivePos;
            const origin =
              gpsEnabledRef.current && userPosRef.current
                ? ([userPosRef.current.lat, userPosRef.current.lng] as [number, number])
                : tee;
            rewire(origin, drivePos);
          });
        }

        setLoaded(true);
      });
    }

    init();

    return () => {
      cancelled = true;
      userMarkerRef.current?.remove?.();
      userMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      applyOriginRef.current = null;
      currentDriveRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holeNumber]);

  // ───────────────────────── GPS watcher ─────────────────────────
  useEffect(() => {
    if (!gpsEnabled) {
      setUserPos(null);
      return;
    }
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setGpsError("GPS not available on this device");
      setGpsEnabled(false);
      return;
    }

    setGpsError(null);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        setGpsError(err.code === err.PERMISSION_DENIED ? "Location permission denied" : "Unable to get GPS fix");
        setGpsEnabled(false);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
    );

    return () => navigator.geolocation.clearWatch(id);
  }, [gpsEnabled]);

  // ─────────── Apply GPS state to the map (user dot + origin rewire) ───────────
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;

      if (gpsEnabled && userPos) {
        if (!userMarkerRef.current) {
          const el = document.createElement("div");
          el.innerHTML = `<div style="
            width:16px;height:16px;border-radius:9999px;
            background:#2563eb;border:3px solid white;
            box-shadow:0 0 0 4px rgba(37,99,235,0.25);
          "></div>`;
          userMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
            .setLngLat([userPos.lng, userPos.lat])
            .addTo(map);
        } else {
          userMarkerRef.current.setLngLat([userPos.lng, userPos.lat]);
        }
        applyOriginRef.current?.([userPos.lat, userPos.lng]);
      } else {
        userMarkerRef.current?.remove?.();
        userMarkerRef.current = null;
        applyOriginRef.current?.(teeRef.current);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gpsEnabled, userPos, loaded]);

  const originSwatch = gpsEnabled ? (
    <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
  ) : (
    <span
      className="w-2 h-2 rounded-full inline-block"
      style={{ backgroundColor: TEE_HEX_COLORS[teeColor || ""] || "#2563eb" }}
    />
  );

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
              {originSwatch}
              <span>{driveYards.toOrigin}y</span>
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
          {gpsEnabled && userPos && (
            <div className="text-blue-200">±{Math.round(userPos.accuracy)}m</div>
          )}
        </div>
      )}

      {loaded && (
        <button
          type="button"
          onClick={() => {
            setGpsError(null);
            setGpsEnabled((v) => !v);
          }}
          className={`absolute top-2 right-2 z-10 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold shadow ${
            gpsEnabled
              ? "bg-blue-600 text-white"
              : "bg-black/60 text-white active:bg-black/75"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v1m0 6v1m4-4h-1m-6 0H8m9.536-5.536l-.707.707M6.464 17.536l.707-.707m0-10.072l-.707-.707m11.072 11.072l-.707-.707M12 12a3 3 0 100-6 3 3 0 000 6z" />
          </svg>
          GPS {gpsEnabled ? "On" : "Off"}
        </button>
      )}

      {gpsError && (
        <div className="absolute bottom-2 left-2 right-2 z-10 bg-red-600/90 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg">
          {gpsError}
        </div>
      )}
    </div>
  );
}
