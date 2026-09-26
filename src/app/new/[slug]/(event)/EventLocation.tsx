"use client";

import { useEffect, useState } from "react";
import styles from "@/app/new/new.module.css";

const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY", "DC",
]);

const STREET_SUFFIX =
  /\b(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|ct|court|way|hwy|highway|pkwy|parkway|cir|circle|ter|terrace|pl|place|route|rte)\b/i;

/**
 * Heuristic: does this location string look like a real, mappable address (vs a
 * free-form place like "Dining Hall" or "The Lodge")? True when it starts with a
 * street number, contains a ZIP, pairs a number with a street suffix, or has a
 * "City, ST" state token. Deterministic, so it's SSR-safe.
 */
function looksLikeAddress(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (/^\d{1,6}\s+\S/.test(s)) return true; // "1234 Main St"
  if (/\b\d{5}(?:-\d{4})?\b/.test(s)) return true; // ZIP
  if (/\d/.test(s) && STREET_SUFFIX.test(s)) return true; // number + a street suffix
  if (s.includes(",") && s.toUpperCase().split(/[\s,]+/).some((t) => US_STATES.has(t))) return true; // "…, MI"
  return false;
}

/**
 * A location line. When it looks like a real address it's tappable to open the
 * device's default maps app (Apple Maps on Apple, geo: intent on Android, else
 * Google Maps web) and shows a pin. Otherwise it renders as plain text — no link,
 * no pin — since free-form places ("Dining Hall") aren't mappable. Defaults to the
 * web URL for SSR, then upgrades to the platform target after mount.
 */
export default function EventLocation({ location }: { location: string }) {
  const mappable = looksLikeAddress(location);
  const q = encodeURIComponent(location);
  const [href, setHref] = useState(`https://www.google.com/maps/search/?api=1&query=${q}`);

  useEffect(() => {
    if (!mappable) return;
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod|Mac/i.test(ua)) setHref(`https://maps.apple.com/?q=${q}`);
    else if (/Android/i.test(ua)) setHref(`geo:0,0?q=${q}`);
  }, [q, mappable]);

  if (!mappable) return <>{location}</>;

  return (
    <a className={styles.locationLink} href={href} target="_blank" rel="noopener noreferrer">
      {location}
      <svg className={styles.locationPin} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    </a>
  );
}
