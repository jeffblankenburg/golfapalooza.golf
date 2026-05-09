"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function SvgIcon({ src, className = "w-6 h-6" }: { src: string; className?: string }) {
  return (
    <div
      className={`${className} bg-current`}
      style={{
        WebkitMaskImage: `url(${src})`,
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskImage: `url(${src})`,
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
      }}
    />
  );
}

const navItems = [
  {
    href: "/",
    label: "Home",
    exact: true,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"
        />
      </svg>
    ),
  },
  {
    href: "/bspitw",
    label: "BSPITW",
    exact: false,
    icon: (
      <SvgIcon src="/noun-trophy-8286316.svg" />
    ),
  },
  {
    href: "/scrambles",
    label: "Scrambles",
    exact: false,
    icon: (
      <SvgIcon src="/noun-golf-tee-3895707.svg" />
    ),
  },
  {
    href: "/cornhole",
    label: "Cornhole",
    exact: false,
    icon: (
      <SvgIcon src="/noun-cornhole-6941307.svg" />
    ),
  },
  {
    href: "/calcutta",
    label: "Calcutta",
    exact: false,
    icon: (
      <SvgIcon src="/noun-gavel-auction.svg" />
    ),
  },
];

const adminItem = {
  href: "/admin",
  label: "Admin",
  exact: false,
  icon: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  ),
};

export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [...navItems, adminItem] : navItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe z-40">
      <div className="flex justify-around items-center h-16">
        {items.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center min-w-[40px] min-h-[48px] w-full h-full ${
                isActive
                  ? "text-green-700"
                  : "text-gray-500 active:text-gray-600"
              }`}
            >
              {item.icon}
              <span className="text-[9px] mt-0.5 font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
