"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Birthday {
  id: string;
  display_name: string;
  avatar_url: string | null;
  age: number;
}

export function BirthdayBanner() {
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);

  useEffect(() => {
    fetch("/api/birthdays/today")
      .then((r) => (r.ok ? r.json() : { birthdays: [] }))
      .then((d) => setBirthdays(d.birthdays || []))
      .catch(() => {});
  }, []);

  if (birthdays.length === 0) return null;

  return (
    <div className="space-y-2">
      {birthdays.map((b) => (
        <Link
          key={b.id}
          href={`/loozers/${b.id}`}
          className="flex items-center gap-4 bg-gradient-to-r from-pink-100 via-yellow-50 to-cyan-100 rounded-2xl p-4 shadow-sm active:scale-[0.98] transition-transform overflow-hidden"
        >
          {b.avatar_url ? (
            <img
              src={b.avatar_url}
              alt=""
              className="w-16 h-16 rounded-full object-cover ring-2 ring-white shadow flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-pink-200 flex items-center justify-center text-pink-700 text-2xl font-bold ring-2 ring-white shadow flex-shrink-0">
              {b.display_name[0]?.toUpperCase() || "?"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-gray-900 truncate">
              🎂 Happy birthday, {b.display_name}!
            </p>
            <p className="text-sm text-gray-600">
              Turning {b.age} today.
            </p>
          </div>
          <div className="flex items-end gap-0.5 text-2xl flex-shrink-0">
            <span
              aria-hidden="true"
              style={{ animation: "birthday-bob 2.4s ease-in-out infinite" }}
            >
              🎈
            </span>
            <span
              aria-hidden="true"
              style={{ animation: "birthday-bob 2.4s ease-in-out 0.3s infinite" }}
            >
              🎉
            </span>
            <span
              aria-hidden="true"
              style={{ animation: "birthday-bob 2.4s ease-in-out 0.6s infinite" }}
            >
              🎈
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
