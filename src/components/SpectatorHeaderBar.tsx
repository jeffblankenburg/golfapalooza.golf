"use client";

import Link from "next/link";
import Image from "next/image";

export function SpectatorHeaderBar() {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
      <div className="relative flex items-center justify-between h-14 px-4">
        {/* Left spacer */}
        <div className="w-20" />

        {/* Center logo */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Link href="/spectator" className="pointer-events-auto">
            <Image
              src="/logo.png"
              alt="Golfapalooza"
              width={49}
              height={36}
              className="h-9 w-auto"
              priority
            />
          </Link>
        </div>

        {/* Right: Login button */}
        <Link
          href="/login"
          className="px-3 py-1.5 bg-green-700 text-white text-xs font-semibold rounded-full"
        >
          Login
        </Link>
      </div>
    </header>
  );
}
