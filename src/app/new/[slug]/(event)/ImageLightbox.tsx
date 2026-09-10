"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";
import styles from "./chat.module.css";
/* eslint-disable @next/next/no-img-element */

/**
 * Full-screen chat image viewer: pinch-to-zoom (mobile), wheel zoom (desktop),
 * double-tap toggle, download + close. Portaled to <body> so the drawer's CSS
 * transform doesn't trap the fixed overlay. Covers the nav intentionally (an
 * immersive media viewer with its own close, matching the legacy lightbox).
 */
const LB_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

export default function ImageLightbox({
  src,
  onClose,
  reactions = [],
  onReact,
}: {
  src: string;
  onClose: () => void;
  reactions?: { emoji: string; count: number; mine: boolean }[];
  onReact?: (emoji: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function download() {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = new URL(src, window.location.href).pathname.split("/").pop() || "image";
      a.download = base.includes(".") ? base : `${base}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(src, "_blank");
    } finally {
      setDownloading(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.lightbox} role="dialog" aria-modal="true">
      <TransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={6}
        doubleClick={{ mode: "toggle", step: 2 }}
        wheel={{ step: 0.2 }}
        pinch={{ step: 5 }}
      >
        <TransformComponent wrapperClass={styles.lbWrap} contentClass={styles.lbContent}>
          <img src={src} alt="" className={styles.lbImg} draggable={false} />
        </TransformComponent>
        <LightboxControls onClose={onClose} onDownload={download} downloading={downloading} />
      </TransformWrapper>

      {onReact && (
        <div className={styles.lbReactions}>
          {LB_EMOJIS.map((e) => {
            const r = reactions.find((x) => x.emoji === e);
            return (
              <button
                key={e}
                type="button"
                className={styles.lbReactBtn}
                data-mine={r?.mine || undefined}
                onClick={() => onReact(e)}
              >
                {e}
                {r && r.count > 0 && <span className={styles.lbReactCount}>{r.count}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>,
    document.body,
  );
}

function LightboxControls({
  onClose,
  onDownload,
  downloading,
}: {
  onClose: () => void;
  onDownload: () => void;
  downloading: boolean;
}) {
  const { resetTransform } = useControls();
  return (
    <>
      <button
        type="button"
        className={styles.lbClose}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
      >
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <button
        type="button"
        className={styles.lbDownload}
        onClick={(e) => {
          e.stopPropagation();
          onDownload();
        }}
        aria-label="Download"
        disabled={downloading}
      >
        {downloading ? (
          <span className={styles.lbSpinner} />
        ) : (
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className={styles.lbReset}
        onClick={(e) => {
          e.stopPropagation();
          resetTransform();
        }}
        aria-label="Reset zoom"
      >
        Reset
      </button>
    </>
  );
}
