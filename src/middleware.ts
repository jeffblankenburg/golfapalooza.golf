import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    // Also skip the public per-org PWA manifest + icon routes so browsers can
    // fetch them uncredentialed without hitting the auth redirect. (New /new
    // sub-paths only — original routes are unaffected.)
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|new/[^/]+/icon$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json|webmanifest)$).*)",
  ],
};
