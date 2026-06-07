import { MusicRouteOpener } from "@/components/music/MusicRouteOpener";

/**
 * Legacy /music route. Music now lives in a universal drawer mounted by
 * MusicPlayerProvider. Visiting this URL just opens that drawer and rewrites
 * the URL back to `/` so the underlying page is something sensible.
 */
export default function MusicPageRoute() {
  return <MusicRouteOpener />;
}
