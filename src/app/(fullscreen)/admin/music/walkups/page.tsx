"use client";

import { WalkupPlayer } from "@/components/admin/WalkupPlayer";

// Full-screen, chrome-less (see the (fullscreen) route group layout). The
// component provides its own close button back to /admin/music.
export default function WalkupPlayerPage() {
  return <WalkupPlayer />;
}
