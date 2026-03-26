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
  // Find current user's room
  let myRoom: Room | null = null;
  let myRoommates: Occupant[] = [];
  let myFacility: Facility | null = null;

  for (const room of rooms) {
    const occupants = getOccupants(room);
    if (occupants.some((o) => o.id === currentUserId)) {
      myRoom = room;
      myRoommates = occupants.filter((o) => o.id !== currentUserId);
      myFacility =
        facilities.find((f) => f.id === room.facility_id) || null;
      break;
    }
  }

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
          <p className="text-green-600/70 text-sm mt-1">
            {myRoom.bed_type} · {myRoom.showers} shower
            {myRoom.showers !== 1 ? "s" : ""}
            {myRoom.smoking ? " · Smoking" : ""}
            {myFacility ? ` · ${myFacility.name}` : ""}
          </p>
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

      {/* All Rooms grouped by facility */}
      {facilities.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            All Rooms
          </h2>
          <div className="space-y-4">
            {facilities.map((facility) => {
              const facilityRooms = rooms.filter(
                (r) => r.facility_id === facility.id
              );
              if (facilityRooms.length === 0) return null;

              return (
                <div key={facility.id}>
                  {facilities.length > 1 && (
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      {facility.name}
                    </h3>
                  )}
                  <div className="space-y-3">
                    {facilityRooms.map((room) => {
                      const occupants = getOccupants(room);
                      return (
                        <div
                          key={room.id}
                          className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
                        >
                          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                            <h4 className="text-sm font-semibold text-gray-700">
                              Room {room.room_number}
                            </h4>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {room.bed_type} · {room.showers} shower
                              {room.showers !== 1 ? "s" : ""}
                              {room.smoking ? " · Smoking" : ""}
                            </p>
                          </div>
                          {occupants.length > 0 ? (
                            <div className="divide-y divide-gray-100">
                              {occupants.map((occupant) => (
                                <div
                                  key={occupant.id}
                                  className="flex items-center gap-3 px-4 py-3"
                                >
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
                            <div className="px-4 py-4">
                              <p className="text-sm text-gray-400 italic">
                                No occupants
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
