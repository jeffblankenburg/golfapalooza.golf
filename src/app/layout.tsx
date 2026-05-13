import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PullToRefresh } from "@/components/PullToRefresh";
import { ActivityTracker } from "@/components/ActivityTracker";
import { SplashFader } from "@/components/SplashFader";
import { WakeLockKeeper } from "@/components/WakeLockKeeper";

const SPLASH_CSS = `
#app-splash {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 36px;
  background: #ffffff;
  transition: opacity 280ms ease-out;
  -webkit-tap-highlight-color: transparent;
}
#app-splash img {
  width: clamp(240px, 65vw, 380px);
  height: auto;
  transform-origin: 50% 80%;
  animation:
    app-splash-drop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0s 1 both,
    app-splash-sway 3.2s ease-in-out 0.7s infinite both;
}
#app-splash .app-splash__dots {
  display: flex;
  gap: 10px;
}
#app-splash .app-splash__dots span {
  width: 9px;
  height: 9px;
  border-radius: 9999px;
  background: #0a5c36;
  animation: app-splash-dot 1.1s ease-in-out infinite;
}
#app-splash .app-splash__dots span:nth-child(2) { animation-delay: 0.15s; }
#app-splash .app-splash__dots span:nth-child(3) { animation-delay: 0.30s; }
#app-splash.app-splash--hidden {
  opacity: 0;
  pointer-events: none;
}
@keyframes app-splash-drop {
  0%   { opacity: 0; transform: translateY(-80px) scale(0.6); }
  100% { opacity: 1; transform: translateY(0)    scale(1);   }
}
@keyframes app-splash-sway {
  0%, 100% { transform: rotate(0deg)  scale(1);    }
  25%      { transform: rotate(4deg)  scale(1.03); }
  75%      { transform: rotate(-4deg) scale(1.03); }
}
@keyframes app-splash-dot {
  0%, 100% { opacity: 0.25; transform: translateY(0); }
  50%      { opacity: 1;    transform: translateY(-5px); }
}
@media (prefers-reduced-motion: reduce) {
  #app-splash img,
  #app-splash .app-splash__dots span { animation: none; }
  #app-splash .app-splash__dots span { opacity: 1; }
}
`;

const APPLE_SPLASH_IMAGES: Array<{ href: string; media: string }> = [
  { href: "/splash/apple-splash-2048-2732.png", media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  { href: "/splash/apple-splash-1668-2388.png", media: "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  { href: "/splash/apple-splash-1536-2048.png", media: "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  { href: "/splash/apple-splash-1640-2360.png", media: "(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  { href: "/splash/apple-splash-1668-2224.png", media: "(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  { href: "/splash/apple-splash-1620-2160.png", media: "(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  { href: "/splash/apple-splash-1488-2266.png", media: "(device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  { href: "/splash/apple-splash-1320-2868.png", media: "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { href: "/splash/apple-splash-1206-2622.png", media: "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { href: "/splash/apple-splash-1260-2736.png", media: "(device-width: 420px) and (device-height: 912px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { href: "/splash/apple-splash-1290-2796.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { href: "/splash/apple-splash-1179-2556.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { href: "/splash/apple-splash-1170-2532.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { href: "/splash/apple-splash-1284-2778.png", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { href: "/splash/apple-splash-1125-2436.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { href: "/splash/apple-splash-1242-2688.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { href: "/splash/apple-splash-828-1792.png",  media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  { href: "/splash/apple-splash-1242-2208.png", media: "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { href: "/splash/apple-splash-750-1334.png",  media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  { href: "/splash/apple-splash-640-1136.png",  media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
];

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


export const metadata: Metadata = {
  title: "Golfapalooza",
  description: "Live scoring, tracking, and planning for Golfapalooza",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Golfapalooza",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a5c36",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="color-scheme" content="light only" />
        {APPLE_SPLASH_IMAGES.map((img) => (
          <link
            key={img.href}
            rel="apple-touch-startup-image"
            href={img.href}
            media={img.media}
          />
        ))}
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-splash-1320-2868.png"
        />
        <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 text-gray-900 min-h-dvh`}
      >
        <SplashFader />
        <PullToRefresh />
        <ActivityTracker />
        <WakeLockKeeper />
        {children}
      </body>
    </html>
  );
}
