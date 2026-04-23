"use client";

import { useState, useEffect } from "react";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";

interface Occupant {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface Room {
  id: string;
  room_number: string;
  facility_id: string | null;
  smoking: boolean;
  showers: number;
  bed_type: string;
  handicapped: boolean;
  pet_friendly: boolean;
  room_assignments: {
    user_id: string;
    user: Occupant | Occupant[] | null;
  }[];
}

interface Facility {
  id: string;
  name: string;
  sort_order: number;
}

type SortMode = "room" | "name";

const SORT_STORAGE_KEY = "rooms:sort";

function getOccupants(room: Room): Occupant[] {
  return (room.room_assignments || [])
    .map((a) => {
      const user = Array.isArray(a.user) ? a.user[0] : a.user;
      return user;
    })
    .filter((u): u is Occupant => u !== null);
}

export function RoomList({
  rooms,
  facilities,
  currentUserId,
}: {
  rooms: Room[];
  facilities: Facility[];
  currentUserId: string;
}) {
  const [sortMode, setSortMode] = useState<SortMode>("room");

  // Hydrate preference from localStorage on mount (skip SSR mismatch).
  useEffect(() => {
    const stored = localStorage.getItem(SORT_STORAGE_KEY);
    if (stored === "name" || stored === "room") setSortMode(stored);
  }, []);

  useEffect(() => {
    localStorage.setItem(SORT_STORAGE_KEY, sortMode);
  }, [sortMode]);

  // Rooms sorted by room number (natural order, e.g. 102A before 103).
  const sortedRooms = [...rooms].sort((a, b) =>
    a.room_number.localeCompare(b.room_number, undefined, { numeric: true })
  );

  // Flat, alphabetized list of {occupant, room} pairs for the by-name view.
  const sortedPeople: { occupant: Occupant; room: Room }[] = sortedRooms
    .flatMap((room) =>
      getOccupants(room).map((occupant) => ({ occupant, room }))
    )
    .sort((a, b) =>
      a.occupant.display_name.localeCompare(b.occupant.display_name, undefined, {
        sensitivity: "base",
      })
    );

  // Find current user's room.
  let myRoom: Room | null = null;
  let myRoommates: Occupant[] = [];
  for (const room of sortedRooms) {
    const occupants = getOccupants(room);
    if (occupants.some((o) => o.id === currentUserId)) {
      myRoom = room;
      myRoommates = occupants.filter((o) => o.id !== currentUserId);
      break;
    }
  }

  void facilities; // kept in props to preserve the page component contract

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Rooms</h1>
        <PinnedNoteButton pinnedTo="rooms" />
      </div>

      {/* Your Room */}
      {myRoom ? (
        <div className="bg-white rounded-2xl p-6 border-2 border-green-600 shadow-sm">
          <p className="text-green-600 text-sm font-medium uppercase tracking-wide">
            Your Room
          </p>
          <div className="mt-2">
            <span className="text-5xl font-bold text-green-700">
              {myRoom.room_number}
            </span>
          </div>
          {myRoommates.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                Roommates
              </p>
              {myRoommates.map((mate) => (
                <div key={mate.id} className="flex items-center gap-2">
                  {mate.avatar_url ? (
                    <img
                      src={mate.avatar_url}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-xs font-bold">
                      {(mate.display_name || "?")[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-900">
                    {mate.display_name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
          <p className="text-gray-500 text-sm text-center">
            You haven&apos;t been assigned to a room yet.
          </p>
        </div>
      )}

      {/* All Rooms / All Loozers */}
      {sortedRooms.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {sortMode === "room" ? "All Rooms" : "All Loozers"}
            </h2>
            <div className="inline-flex rounded-full border border-gray-200 bg-white p-0.5 text-xs font-medium">
              <button
                onClick={() => setSortMode("room")}
                className={`px-3 py-1 rounded-full transition-colors ${
                  sortMode === "room"
                    ? "bg-green-600 text-white"
                    : "text-gray-600 active:bg-gray-100"
                }`}
              >
                By Room
              </button>
              <button
                onClick={() => setSortMode("name")}
                className={`px-3 py-1 rounded-full transition-colors ${
                  sortMode === "name"
                    ? "bg-green-600 text-white"
                    : "text-gray-600 active:bg-gray-100"
                }`}
              >
                By Name
              </button>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
            {sortMode === "room"
              ? sortedRooms.map((room) => {
                  const occupants = getOccupants(room);
                  return (
                    <div key={room.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-10 shrink-0 self-start pt-1.5">
                        <span className="text-sm font-semibold text-gray-500">{room.room_number}</span>
                        {(room.handicapped || room.pet_friendly) && (
                          <div className="flex gap-0.5 mt-0.5">
                            {room.handicapped && <span className="text-[10px]" title="Handicap Accessible">♿</span>}
                            {room.pet_friendly && <span className="text-[10px]" title="Pet Friendly">🐾</span>}
                          </div>
                        )}
                      </div>
                      {occupants.length > 0 ? (
                        <div className="flex-1 space-y-2">
                          {occupants.map((occupant) => (
                            <div key={occupant.id} className="flex items-center gap-3">
                              {occupant.avatar_url ? (
                                <img
                                  src={occupant.avatar_url}
                                  alt=""
                                  className="w-8 h-8 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-sm font-bold">
                                  {(occupant.display_name || "?")[0].toUpperCase()}
                                </div>
                              )}
                              <span
                                className={`text-sm font-medium ${
                                  occupant.id === currentUserId
                                    ? "text-green-700"
                                    : "text-gray-900"
                                }`}
                              >
                                {occupant.display_name}
                                {occupant.id === currentUserId && (
                                  <span className="text-green-600 text-xs ml-1">
                                    (you)
                                  </span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 italic">
                          No occupants
                        </span>
                      )}
                    </div>
                  );
                })
              : sortedPeople.map(({ occupant, room }) => (
                  <div
                    key={occupant.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    {occupant.avatar_url ? (
                      <img
                        src={occupant.avatar_url}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-sm font-bold shrink-0">
                        {(occupant.display_name || "?")[0].toUpperCase()}
                      </div>
                    )}
                    <span
                      className={`flex-1 text-sm font-medium truncate ${
                        occupant.id === currentUserId
                          ? "text-green-700"
                          : "text-gray-900"
                      }`}
                    >
                      {occupant.display_name}
                      {occupant.id === currentUserId && (
                        <span className="text-green-600 text-xs ml-1">
                          (you)
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(room.handicapped || room.pet_friendly) && (
                        <div className="flex gap-0.5">
                          {room.handicapped && (
                            <span className="text-[10px]" title="Handicap Accessible">
                              ♿
                            </span>
                          )}
                          {room.pet_friendly && (
                            <span className="text-[10px]" title="Pet Friendly">
                              🐾
                            </span>
                          )}
                        </div>
                      )}
                      <span className="text-sm font-semibold text-gray-500 tabular-nums">
                        {room.room_number}
                      </span>
                    </div>
                  </div>
                ))}
          </div>
        </div>
      )}
    </div>
  );
}
