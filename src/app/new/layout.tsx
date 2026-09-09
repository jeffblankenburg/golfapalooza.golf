import { headers } from "next/headers";
import { Playfair_Display, Libre_Franklin } from "next/font/google";
import { resolveOrgByHost } from "@/lib/v2/domain";
import styles from "./new.module.css";

/**
 * Inherit the device's font-size preference. iOS Safari only applies the system
 * Dynamic Type setting to web pages when the root font is seeded from a system
 * text style — `font: -apple-system-body` does exactly that, so every rem-based
 * size scales with the user's iOS setting. On Android/desktop the keyword is
 * ignored and the browser's own font-size scaling applies. We immediately
 * restore our typeface on the body; only the (dynamic) size carries down.
 */
const OS_FONT_INHERIT_CSS =
  "html{font:-apple-system-body;-webkit-text-size-adjust:100%}";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});
const libre = Libre_Franklin({
  subsets: ["latin"],
  variable: "--font-libre",
  display: "swap",
});

export const metadata = {
  title: "Golf Platform (preview)",
};

/**
 * The /new theme wrapper — fonts, background, and the per-org brand color (from
 * the request host on a custom domain). No visible chrome here: registration/
 * admin pages provide their own headers, and the event experience mounts its own
 * fixed top-bar/bottom-nav shell.
 */
export default async function NewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const host = (await headers()).get("host");
  const org = await resolveOrgByHost(host);
  const brand = org?.primary_color || "#0a5c36";

  return (
    <div
      className={`${playfair.variable} ${libre.variable} ${styles.wrap}`}
      style={{ ["--brand" as string]: brand } as React.CSSProperties}
    >
      <style dangerouslySetInnerHTML={{ __html: OS_FONT_INHERIT_CSS }} />
      {children}
    </div>
  );
}
