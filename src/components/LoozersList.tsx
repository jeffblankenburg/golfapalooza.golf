"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Loozer {
  id: string;
  display_name: string;
  avatar_url: string | null;
  has_bio: boolean;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

export function LoozersList() {
  const [loozers, setLoozers] = useState<Loozer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/loozers")
      .then((res) => res.json())
      .then((data) => {
        setLoozers(data.loozers || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loozers.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-lg font-medium">No Loozers found</p>
        <p className="text-sm mt-1">Check back once the roster is set.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {loozers.map((loozer) => (
        <Link
          key={loozer.id}
          href={`/loozers/${loozer.id}`}
          className="flex flex-col items-center p-3 bg-white rounded-xl border border-gray-200 shadow-sm active:scale-95 transition-transform"
        >
          <div className="w-16 h-16 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center mb-2">
            {loozer.avatar_url ? (
              <img
                src={loozer.avatar_url}
                alt={loozer.display_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xl font-bold">
                {getInitials(loozer.display_name)}
              </span>
            )}
          </div>
          <span className="text-xs font-semibold text-gray-900 text-center leading-tight">
            {loozer.display_name}
          </span>
        </Link>
      ))}
    </div>
  );
}
