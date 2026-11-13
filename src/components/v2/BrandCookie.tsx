"use client";

import { useEffect } from "react";

/**
 * Stashes the active group's logo in a cookie so the root layout can render the
 * launch splash (<SplashFader>) with THIS group's logo on the next reload —
 * instead of the platform default. The root layout can't see the group's params,
 * so the cookie is the bridge. Cleared to null when the group has no logo.
 */
export function BrandCookie({ logoUrl }: { logoUrl: string | null }) {
  useEffect(() => {
    if (logoUrl) {
      document.cookie = `v2_brand_logo=${encodeURIComponent(logoUrl)}; path=/; max-age=31536000; samesite=lax`;
    } else {
      document.cookie = "v2_brand_logo=; path=/; max-age=0; samesite=lax";
    }
  }, [logoUrl]);
  return null;
}
