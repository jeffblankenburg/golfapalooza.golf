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

// Gate thresholds for the auto-target state machine.
const GATE_YARDS = 200;         // trigger distance for tee→tracking and tracking→green
const FMB_YARDS = 250;          // show front/middle/back distances when user within this
// GPS jitter is typically 1–2 yards; anything past this counts as real movement
// and (a) re-frames the camera and (b) clears any manual pan/zoom override.
const RESET_YARDS = 3;

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

/** Project `origin` forward along a compass bearing by `distanceYards`. */
function projectPoint(
  origin: [number, number],
  bearingDeg: number,
  distanceYards: number
): [number, number] {
  const R = 6371000;
  const d = distanceYards / 1.09361 / R;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const toDeg = (x: number) => (x * 180) / Math.PI;
  const brng = toRad(bearingDeg);
  const lat1 = toRad(origin[0]);
  const lng1 = toRad(origin[1]);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
  return [toDeg(lat2), toDeg(lng2)];
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
  teeColor,
}: HoleMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [distances, setDistances] = useState<{
    userToTarget: number;
    targetToGreen: number;
    userToGreen: number;
    userToFront: number | null;
    userToBack: number | null;
  } | null>(null);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const driveMarkerRef = useRef<any>(null);

  // Auto-target state: one-way gates (tee → tracking → green). Reset per hole.
  // Manual drag flips manualOverrideRef true; each gate transition clears it.
  const targetStateRef = useRef<"tee" | "tracking" | "green">("tee");
  const manualOverrideRef = useRef(false);
  const lastFitUserRef = useRef<[number, number] | null>(null);
  // Frames the camera so the green sits near the top center and the user
  // (or tee, when GPS is off) sits near the bottom center.
  const applyAutoCameraRef = useRef<((origin: [number, number]) => void) | null>(null);
  // Set when the user pans/zooms/rotates the map themselves. Cleared on the
  // next GPS tick that shows meaningful movement (≥ RESET_YARDS).
  const userMapOverrideRef = useRef(false);

  const gpsEnabledRef = useRef(gpsEnabled);
  gpsEnabledRef.current = gpsEnabled;
  const userPosRef = useRef(userPos);
  userPosRef.current = userPos;

  // ───────────────────────── Map init (per hole) ─────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    setLoaded(false);
    applyOriginRef.current = null;
    currentDriveRef.current = null;
    userMarkerRef.current = null;
    driveMarkerRef.current = null;
    manualOverrideRef.current = false;
    lastFitUserRef.current = null;
    userMapOverrideRef.current = false;
    applyAutoCameraRef.current = null;

    const tee = teeRef.current;
    const green = greenRef.current;
    // Target starts on the ideal drive if we have it, else snaps to green center
    // (par 3s and any hole missing a drive coordinate). State reflects that choice.
    const hasDrive = !!driveRef.current;
    const initialDrive = driveRef.current || green;
    targetStateRef.current = hasDrive ? "tee" : "green";

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

        // Re-frame the camera so origin (user or tee) sits near the bottom
        // center and green sits near the top center. Bearing aligns the
        // origin→green vector with screen "up", and asymmetric vertical
        // padding centers each end of the line.
        applyAutoCameraRef.current = (origin) => {
          const g = greenRef.current;
          if (!g) return;
          const bounds = new mapboxgl.LngLatBounds(
            [origin[1], origin[0]],
            [g[1], g[0]]
          );
          const cam = map.cameraForBounds(bounds, {
            padding: { top: 90, bottom: 110, left: 40, right: 40 },
            bearing: getBearing(origin, g),
            maxZoom: 19,
          });
          if (cam) {
            map.easeTo({ ...cam, pitch: 0, duration: 350 });
          }
        };

        // Distinguish user gestures from programmatic camera moves: only
        // user-initiated events have an originalEvent on them.
        const onUserGesture = (e: { originalEvent?: Event }) => {
          if (e.originalEvent) userMapOverrideRef.current = true;
        };
        map.on("dragstart", onUserGesture);
        map.on("zoomstart", onUserGesture);
        map.on("rotatestart", onUserGesture);

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

        // Draggable target crosshair + first/second dotted segments
        if (initialDrive && green) {
          const driveEl = document.createElement("div");
          driveEl.innerHTML = `<svg width="44" height="44" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="16" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="2 3" opacity="0.85"/>
            <circle cx="22" cy="22" r="10" fill="none" stroke="#f59e0b" stroke-width="2.5"/>
            <line x1="22" y1="2" x2="22" y2="9" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="22" y1="35" x2="22" y2="42" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="2" y1="22" x2="9" y2="22" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="35" y1="22" x2="42" y2="22" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="22" cy="22" r="2.5" fill="#f59e0b"/>
          </svg>`;
          driveEl.style.cursor = "grab";
          driveEl.style.filter = "drop-shadow(0 1px 2px rgba(0,0,0,0.55))";

          const driveMarker = new mapboxgl.Marker({ element: driveEl, anchor: "center", draggable: true })
            .setLngLat([initialDrive[1], initialDrive[0]])
            .addTo(map);
          driveMarkerRef.current = driveMarker;

          // Origin defaults to tee; GPS effect swaps this out when enabled.
          const startingOrigin: [number, number] =
            gpsEnabledRef.current && userPosRef.current
              ? [userPosRef.current.lat, userPosRef.current.lng]
              : tee;

          const originLineInfo = addDistanceLabel("tee-drive", startingOrigin, initialDrive);
          const greenLineInfo = addDistanceLabel("drive-green", initialDrive, green);

          currentDriveRef.current = initialDrive;

          const frontYards = greenFrontRef.current ? calcYards(startingOrigin, greenFrontRef.current) : null;
          const backYards = greenBackRef.current ? calcYards(startingOrigin, greenBackRef.current) : null;
          setDistances({
            userToTarget: originLineInfo.yards,
            targetToGreen: greenLineInfo.yards,
            userToGreen: calcYards(startingOrigin, green),
            userToFront: frontYards,
            userToBack: backYards,
          });

          // Rewire first segment (origin → drive). Called from:
          //   • drag handler (drive pos changed)
          //   • GPS watcher (origin changed, possibly with an auto-moved target)
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

            const userToTarget = calcYards(origin, drivePos);
            const targetToGreen = calcYards(drivePos, green!);
            const userToGreen = calcYards(origin, green!);

            const originLabelEl = containerRef.current?.querySelector(".map-distance-label-tee-drive div") as HTMLElement;
            if (originLabelEl) originLabelEl.textContent = `${userToTarget}y`;
            originLineInfo.labelMarker.setLngLat([
              (origin[1] + drivePos[1]) / 2,
              (origin[0] + drivePos[0]) / 2,
            ]);

            const greenLabelEl = containerRef.current?.querySelector(".map-distance-label-drive-green div") as HTMLElement;
            if (greenLabelEl) greenLabelEl.textContent = `${targetToGreen}y`;
            greenLineInfo.labelMarker.setLngLat([
              (drivePos[1] + green![1]) / 2,
              (drivePos[0] + green![0]) / 2,
            ]);

            const userToFront = greenFrontRef.current ? calcYards(origin, greenFrontRef.current) : null;
            const userToBack = greenBackRef.current ? calcYards(origin, greenBackRef.current) : null;
            setDistances({ userToTarget, targetToGreen, userToGreen, userToFront, userToBack });
          }

          applyOriginRef.current = (origin) => {
            if (!currentDriveRef.current) return;
            rewire(origin, currentDriveRef.current);
          };

          driveMarker.on("dragstart", () => {
            manualOverrideRef.current = true;
          });
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
          driveMarker.on("dragend", () => {
            // Don't fight the user's framing on a target tweak — the next
            // GPS tick will re-apply auto framing if appropriate.
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
      driveMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      applyOriginRef.current = null;
      currentDriveRef.current = null;
      lastFitUserRef.current = null;
      applyAutoCameraRef.current = null;
      userMapOverrideRef.current = false;
    };
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

  // ─────────── Apply GPS state to the map (user dot + state machine + zoom) ───────────
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;

      if (!gpsEnabled || !userPos) {
        userMarkerRef.current?.remove?.();
        userMarkerRef.current = null;
        lastFitUserRef.current = null;
        userMapOverrideRef.current = false;
        applyOriginRef.current?.(teeRef.current);
        applyAutoCameraRef.current?.(teeRef.current);
        return;
      }

      // User marker
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

      const user: [number, number] = [userPos.lat, userPos.lng];
      const green = greenRef.current;
      const drive = driveRef.current;

      // ─── State machine: gates are one-way locks, each clears manual-override ───
      if (green) {
        const distUserGreen = calcYards(user, green);
        if (distUserGreen <= GATE_YARDS && targetStateRef.current !== "green") {
          targetStateRef.current = "green";
          manualOverrideRef.current = false;
        } else if (
          targetStateRef.current === "tee" &&
          drive &&
          calcYards(user, drive) <= GATE_YARDS
        ) {
          targetStateRef.current = "tracking";
          manualOverrideRef.current = false;
        }

        // Apply auto target unless the user is currently overriding with a drag.
        // 'tee' keeps the static ideal-drive point; 'tracking' projects 200y
        // ahead of the user on the line to green; 'green' snaps to the center.
        if (!manualOverrideRef.current && driveMarkerRef.current) {
          let autoTarget: [number, number] | null = null;
          if (targetStateRef.current === "green") {
            autoTarget = green;
          } else if (targetStateRef.current === "tracking") {
            autoTarget = projectPoint(user, getBearing(user, green), GATE_YARDS);
          }
          if (autoTarget) {
            currentDriveRef.current = autoTarget;
            driveMarkerRef.current.setLngLat([autoTarget[1], autoTarget[0]]);
          }
        }
      }

      // Rewire origin/green segments with new user origin and current target
      applyOriginRef.current?.(user);

      // ─── Keep green at top center, user at bottom center ───
      // Re-frame on every tick that shows real movement. Any meaningful
      // movement also clears a manual pan/zoom override so the camera
      // resets the moment the player walks.
      if (green) {
        const last = lastFitUserRef.current;
        const movedYards = last ? calcYards(last, user) : Infinity;
        const meaningfulMove = movedYards >= RESET_YARDS;

        if (meaningfulMove) {
          userMapOverrideRef.current = false;
          lastFitUserRef.current = user;
        }

        if (!userMapOverrideRef.current) {
          applyAutoCameraRef.current?.(user);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gpsEnabled, userPos, loaded]);

  const showFMB =
    distances != null &&
    distances.userToGreen <= FMB_YARDS &&
    distances.userToFront != null &&
    distances.userToBack != null;

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ minHeight: "200px" }}>
      {!loaded && (
        <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
          Loading map...
        </div>
      )}

      {loaded && distances && (
        <div className="absolute top-2 left-2 z-10 flex gap-1.5 pointer-events-none">
          <div className="bg-black/75 backdrop-blur-sm text-white rounded-lg px-3 py-1.5 text-center shadow-lg">
            <div className="text-[9px] font-bold tracking-widest text-amber-300 uppercase leading-none">
              Target
            </div>
            <div className="text-base font-extrabold leading-tight tabular-nums mt-0.5">
              {distances.userToTarget}
              <span className="text-[10px] font-semibold ml-0.5 opacity-75">y</span>
            </div>
          </div>

          {showFMB ? (
            <div className="bg-black/75 backdrop-blur-sm text-white rounded-lg px-3 py-1.5 flex gap-3 shadow-lg">
              <div className="text-center">
                <div className="text-[9px] font-bold tracking-widest text-green-300 uppercase leading-none">
                  F
                </div>
                <div className="text-base font-extrabold leading-tight tabular-nums mt-0.5">
                  {distances.userToFront}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[9px] font-bold tracking-widest text-green-300 uppercase leading-none">
                  M
                </div>
                <div className="text-base font-extrabold leading-tight tabular-nums mt-0.5">
                  {distances.userToGreen}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[9px] font-bold tracking-widest text-green-300 uppercase leading-none">
                  B
                </div>
                <div className="text-base font-extrabold leading-tight tabular-nums mt-0.5">
                  {distances.userToBack}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-black/75 backdrop-blur-sm text-white rounded-lg px-3 py-1.5 text-center shadow-lg">
              <div className="text-[9px] font-bold tracking-widest text-green-300 uppercase leading-none">
                Green
              </div>
              <div className="text-base font-extrabold leading-tight tabular-nums mt-0.5">
                {distances.userToGreen}
                <span className="text-[10px] font-semibold ml-0.5 opacity-75">y</span>
              </div>
            </div>
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

      {loaded && gpsEnabled && userPos && (
        <div className="absolute bottom-2 left-2 z-10 bg-black/55 text-blue-100 text-[10px] font-semibold px-2 py-0.5 rounded">
          ±{Math.round(userPos.accuracy)}m
        </div>
      )}

      {gpsError && (
        <div className="absolute bottom-2 left-2 right-2 z-10 bg-red-600/90 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg">
          {gpsError}
        </div>
      )}
    </div>
  );
}
