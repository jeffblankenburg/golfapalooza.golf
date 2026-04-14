"use client";

import { useEffect, useRef, useState } from "react";

interface HoleMapViewProps {
  teeLatLng: [number, number];
  greenLatLng: [number, number] | null;
  holeNumber: number;
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

export default function HoleMapView({
  teeLatLng,
  greenLatLng,
  holeNumber,
  showUserLocation = false,
}: HoleMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Stable refs to avoid re-creating the map when parent re-renders with same values
  const teeRef = useRef(teeLatLng);
  const greenRef = useRef(greenLatLng);
  teeRef.current = teeLatLng;
  greenRef.current = greenLatLng;

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    const tee = teeRef.current;
    const green = greenRef.current;

    async function init() {
      const mapboxgl = (await import("mapbox-gl")).default;
      // @ts-expect-error CSS import has no types
      await import("mapbox-gl/dist/mapbox-gl.css");

      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

      const center: [number, number] = green
        ? [(tee[1] + green[1]) / 2, (tee[0] + green[0]) / 2]
        : [tee[1], tee[0]];

      // Bearing: rotate so green is at top (0° on screen)
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

        // Fit bounds to show both markers
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

        // Tee marker
        const teeEl = document.createElement("div");
        teeEl.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;">
            <svg width="28" height="35" viewBox="0 0 32 40">
              <circle cx="16" cy="8" r="6" fill="#16a34a" stroke="white" stroke-width="2"/>
              <rect x="14.5" y="14" width="3" height="18" rx="1.5" fill="#16a34a" stroke="white" stroke-width="1"/>
              <rect x="8" y="30" width="16" height="4" rx="2" fill="#16a34a" stroke="white" stroke-width="1"/>
            </svg>
            <div style="margin-top:1px;background:rgba(0,0,0,0.7);color:white;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;">${holeNumber}</div>
          </div>`;
        teeEl.style.cursor = "default";
        new mapboxgl.Marker({ element: teeEl, anchor: "bottom" })
          .setLngLat([tee[1], tee[0]])
          .addTo(map);

        // Green/flag marker
        if (green) {
          const flagEl = document.createElement("div");
          flagEl.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;">
              <svg width="28" height="38" viewBox="0 0 32 44">
                <rect x="14" y="4" width="2.5" height="36" rx="1.25" fill="#374151" stroke="white" stroke-width="1"/>
                <path d="M16.5 4 L30 11 L16.5 18 Z" fill="#16a34a" stroke="white" stroke-width="1"/>
                <ellipse cx="15.25" cy="40" rx="6" ry="2.5" fill="#16a34a" stroke="white" stroke-width="1"/>
              </svg>
            </div>`;
          flagEl.style.cursor = "default";
          new mapboxgl.Marker({ element: flagEl, anchor: "bottom" })
            .setLngLat([green[1], green[0]])
            .addTo(map);
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
          // Auto-trigger geolocation after a short delay
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
  // Only re-create the map when the hole changes — coordinates are read from refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holeNumber]);

  return (
    <div ref={containerRef} className="w-full h-full" style={{ minHeight: "200px" }}>
      {!loaded && (
        <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
          Loading map...
        </div>
      )}
    </div>
  );
}
