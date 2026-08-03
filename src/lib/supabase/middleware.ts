import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser();

  // Define route types
  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/verify");
  const isPublicRoute =
    request.nextUrl.pathname.startsWith("/spectator") ||
    request.nextUrl.pathname === "/privacy" ||
    request.nextUrl.pathname === "/terms";
  const isProtectedRoute =
    !isAuthRoute &&
    !isPublicRoute &&
    !request.nextUrl.pathname.startsWith("/api");

  // Public article detail links: let anyone read a shared /articles/:id URL.
  // Anonymous visitors are internally rewritten to the spectator render (same
  // published-only data, no auth) so the URL stays /articles/:id. Signed-in
  // users fall through to the full in-app article page below.
  const articleMatch = request.nextUrl.pathname.match(/^\/articles\/([^/]+)\/?$/);
  if (!user && articleMatch) {
    const url = request.nextUrl.clone();
    url.pathname = `/spectator/articles/${articleMatch[1]}`;
    return NextResponse.rewrite(url);
  }

  // Redirect unauthenticated users to login
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
