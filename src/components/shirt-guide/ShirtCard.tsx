"use client";

import { useState } from "react";
import { ImageLightbox } from "@/components/ImageLightbox";

/**
 * Public Shirt Guide card. When the shirt has a photo the whole card is
 * tappable and opens the image full-screen (pinch-to-zoom via ImageLightbox).
 * Photo-less shirts render as a plain, non-interactive card.
 */
export function ShirtCard({
  name,
  description,
  imageUrl,
}: {
  name: string;
  description: string | null;
  imageUrl: string | null;
}) {
  const [open, setOpen] = useState(false);

  const base = "flex gap-4 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden w-full text-left";

  const content = (
    <>
      <div className="w-24 h-24 flex-shrink-0 bg-gray-100 flex items-center justify-center">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <svg className="w-9 h-9 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.47a2 2 0 00-1.34-2.23z" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0 py-3 pr-3 self-center">
        <p className="font-semibold text-gray-900">{name}</p>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
    </>
  );

  if (!imageUrl) {
    return <div className={base}>{content}</div>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${base} active:scale-[0.99] transition-transform`}
      >
        {content}
      </button>
      {open && <ImageLightbox src={imageUrl} alt={name} onClose={() => setOpen(false)} />}
    </>
  );
}
