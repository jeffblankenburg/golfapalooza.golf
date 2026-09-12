import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import React from "react";
import { v2AdminClient } from "@/lib/v2/supabase";

/**
 * Per-org PWA app icon: the org's logo composited onto a square canvas at the
 * requested size (192/512), with a safe-zone margin for the maskable variant.
 * This is what makes each tenant install with its OWN icon. Falls back to the
 * default app icons when the org has no logo or rendering fails.
 */
export const dynamic = "force-dynamic";

function fallback(origin: string, size: number) {
  return NextResponse.redirect(
    new URL(`/icons/icon-${size === 512 ? "512x512" : "192x192"}.png`, origin),
  );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const u = new URL(req.url);
  const size = u.searchParams.get("size") === "512" ? 512 : 192;
  const maskable = u.searchParams.get("maskable") === "1";

  const admin = v2AdminClient();
  const { data: org } = await admin
    .from("v2_organizations")
    .select("logo_url")
    .eq("slug", slug)
    .maybeSingle();

  const logo = org?.logo_url;
  if (!logo) return fallback(u.origin, size);

  // Maskable icons need ~10–20% safe-zone padding so the logo isn't clipped when
  // the platform applies a circular/rounded mask.
  const pad = Math.round(size * (maskable ? 0.16 : 0.08));
  try {
    return new ImageResponse(
      React.createElement(
        "div",
        {
          style: {
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#ffffff",
          },
        },
        React.createElement("img", {
          src: logo,
          width: size - pad * 2,
          height: size - pad * 2,
          style: { objectFit: "contain" },
        }),
      ),
      {
        width: size,
        height: size,
        headers: { "Cache-Control": "public, max-age=3600" },
      },
    );
  } catch {
    return fallback(u.origin, size);
  }
}
