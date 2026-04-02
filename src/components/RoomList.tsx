"use client";

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
  // Sort all rooms by room number ascending
  const sortedRooms = [...rooms].sort((a, b) =>
    a.room_number.localeCompare(b.room_number, undefined, { numeric: true })
  );

  // Find current user's room
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

  // Keep facilities in props to avoid changing the page component contract
  void facilities;

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Rooms</h1>

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

      {/* All Rooms */}
      {sortedRooms.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            All Rooms
          </h2>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
            {sortedRooms.map((room) => {
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
            })}
          </div>
        </div>
      )}
    </div>
  );
}
