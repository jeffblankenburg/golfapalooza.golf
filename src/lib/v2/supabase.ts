import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Supabase access for the v2 platform. Deliberately self-contained — the new app
 * shares only the Supabase project's auth with the legacy app and imports none of
 * its code. Every helper here is owned by v2.
 *
 * Auth works for BOTH clients from a single path:
 *   - Web: the SSR cookie session (v2ServerClient).
 *   - Native (iOS/Android): a Supabase JWT sent as `Authorization: Bearer <jwt>`.
 * `v2GetUser(request)` resolves either and returns an RLS-scoped client, so the
 * same membership policies protect web and native equally.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** RLS-respecting client bound to the web cookie session. */
export async function v2ServerClient() {
  const cookieStore = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component — safe to ignore; middleware refreshes.
        }
      },
    },
  });
}

/** Service-role client. Server-only; bypasses RLS. Never expose to the browser. */
export function v2AdminClient(): SupabaseClient {
  return createSupabaseClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** RLS-respecting client bound to a bearer token (native app requests). */
export function v2TokenClient(token: string): SupabaseClient {
  return createSupabaseClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface V2Auth {
  userId: string | null;
  /** RLS-scoped client for the caller (bearer token client, or cookie client). */
  supabase: SupabaseClient;
}

/**
 * Resolve the caller for an API route from either a bearer token (native) or the
 * cookie session (web), and return an RLS-scoped client for them. Privileged
 * writes should still use v2AdminClient() after checking `userId`.
 */
export async function v2GetUser(request: Request): Promise<V2Auth> {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    const supabase = v2TokenClient(token);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { userId: user?.id ?? null, supabase };
  }
  const supabase = await v2ServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { userId: user?.id ?? null, supabase };
}
