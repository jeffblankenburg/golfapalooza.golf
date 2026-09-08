import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client for the v2 app (phone-OTP signup/login, client reads).
 * Stores the session in cookies via @supabase/ssr so v2 server components +
 * /api/v2 routes see the same session. v2-owned; no legacy imports.
 */
export function v2BrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
