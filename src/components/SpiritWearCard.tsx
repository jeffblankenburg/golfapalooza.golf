"use client";

const STORE_HOST_PATH = "stores.inksoft.com/golfapalooza_spiritwear/shop/products/all?page=1";
const STORE_URL = `https://${STORE_HOST_PATH}`;

// Force the link out of the app and into the device's real browser.
// Android: an intent:// URL hands off to the system default browser,
// escaping any in-app webview / custom tab. iOS has no web API to force a
// separate Safari app, so target="_blank" (handled by the anchor) is the
// maximum there.
function openExternally(e: React.MouseEvent) {
  if (typeof navigator === "undefined") return;
  if (/Android/i.test(navigator.userAgent)) {
    e.preventDefault();
    window.location.href =
      `intent://${STORE_HOST_PATH}#Intent;scheme=https;` +
      `action=android.intent.action.VIEW;` +
      `S.browser_fallback_url=${encodeURIComponent(STORE_URL)};end`;
  }
}

// Studio product shots pulled from the InkSoft store catalog and cached
// locally under /public/spiritwear so the card never depends on the store CDN.
const PRODUCTS = [
  { src: "/spiritwear/quarter-zip.png", alt: "Royal blue 1/4-zip pullover" },
  { src: "/spiritwear/hoodie.png", alt: "Black hooded pullover" },
  { src: "/spiritwear/backpack.png", alt: "Backpack" },
  { src: "/spiritwear/tee.png", alt: "Long-sleeve tee" },
];

/**
 * Prominent home-page card linking out to the external Golfapalooza Spirit
 * Wear store (InkSoft). Shows a strip of product photos so it reads as a
 * shop at a glance. Opens in a new tab — the store is intentionally not
 * embedded in the app.
 */
export function SpiritWearCard() {
  return (
    <a
      href={STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={openExternally}
      className="block bg-blue-50 border border-blue-200 rounded-2xl shadow-sm overflow-hidden active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center gap-3 px-4 pt-4">
        <div className="flex items-center justify-center w-11 h-11 rounded-full bg-blue-100 text-blue-600 flex-shrink-0">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-blue-900 text-lg leading-tight">Get Golfapalooza Gear</p>
          <p className="text-blue-600 text-sm">Hats, hoodies, tees &amp; more</p>
        </div>
        <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5h5v5m0-5L9 15M5 9v10h10" />
        </svg>
      </div>
      <div className="grid grid-cols-4 gap-2 p-3">
        {PRODUCTS.map((p) => (
          <div key={p.src} className="aspect-square rounded-xl bg-white border border-blue-100 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.src} alt={p.alt} className="w-full h-full object-contain" loading="lazy" />
          </div>
        ))}
      </div>
    </a>
  );
}
