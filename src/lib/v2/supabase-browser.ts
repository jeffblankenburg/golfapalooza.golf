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

/**
 * Browser client with the realtime socket authenticated with the current user's
 * JWT. `createBrowserClient` (from @supabase/ssr) does NOT reliably push the
 * access token to the realtime connection, so RLS-gated `postgres_changes`
 * silently deliver nothing (the socket joins as `anon`). Await this before
 * subscribing to any RLS-protected table so the user actually receives events.
 */
export async function v2RealtimeClient() {
  const supabase = v2BrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) supabase.realtime.setAuth(token);
  return supabase;
}
