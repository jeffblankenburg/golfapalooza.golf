"use client";

import { useEffect, useState } from "react";
import styles from "@/app/new/new.module.css";

/**
 * The event location, tappable to open the device's default maps app. Apple devices
 * → Apple Maps, Android → the geo: intent (whatever's set as default), everything
 * else → Google Maps on the web. Defaults to the web URL for SSR, then upgrades to
 * the platform target after mount (avoids a hydration mismatch on UA detection).
 */
export default function EventLocation({ location }: { location: string }) {
  const q = encodeURIComponent(location);
  const [href, setHref] = useState(`https://www.google.com/maps/search/?api=1&query=${q}`);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod|Mac/i.test(ua)) setHref(`https://maps.apple.com/?q=${q}`);
    else if (/Android/i.test(ua)) setHref(`geo:0,0?q=${q}`);
  }, [q]);

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
