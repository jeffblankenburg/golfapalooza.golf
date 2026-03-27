"use client";

import { useState, useEffect, useCallback } from "react";
import { BottomDrawer } from "@/components/admin/BottomDrawer";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface Room {
  id: string;
  room_number: string;
  facility_id: string | null;
  smoking: boolean;
  showers: number;
  bed_type: string;
  room_assignments: {
    id: string;
    user_id: string;
    trip_id: string | null;
    user: {
      id: string;
      display_name: string;
      full_name: string | null;
      avatar_url: string | null;
    } | null;
  }[];
}

interface Facility {
  id: string;
  name: string;
  sort_order: number;
}

interface UserWithRoom {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  room_id: string | null;
  room_number: string | null;
}

interface Trip {
  id: string;
  trip_name: string;
  trip_year: number;
}

export function RoomManager({ tripId: propTripId }: { tripId?: string } = {}) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [linkedFacilityIds, setLinkedFacilityIds] = useState<string[]>([]);
  const [users, setUsers] = useState<UserWithRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const fetchTrip = useCallback(async () => {
    const url = propTripId
      ? `/api/admin/trips?id=${propTripId}`
      : "/api/admin/trips?status=active";
    const res = await fetch(url);
    const data = await res.json();
    if (data.trip) {
      setTrip(data.trip);
      return data.trip;
    }
    return null;
  }, [propTripId]);

  const fetchRooms = useCallback(async (tripId: string) => {
    const res = await fetch(`/api/admin/rooms?trip_id=${tripId}`);
    const data = await res.json();
    if (data.rooms) setRooms(data.rooms);
    if (data.facilities) setFacilities(data.facilities);
    if (data.linkedFacilityIds) setLinkedFacilityIds(data.linkedFacilityIds);
    return data.rooms || [];
  }, []);

  const fetchUsers = useCallback(async (tripId: string) => {
    const res = await fetch(`/api/admin/rooms/assignments?trip_id=${tripId}`);
    const data = await res.json();
    if (data.users) setUsers(data.users);
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const t = await fetchTrip();
      if (t) {
        await Promise.all([fetchRooms(t.id), fetchUsers(t.id)]);
      }
      setLoading(false);
    }
    init();
  }, [fetchTrip, fetchRooms, fetchUsers]);

  const openDrawer = (room: Room) => {
    setSelectedRoom(room);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => setSelectedRoom(null), 200);
  };

  const toggleAssignment = async (userId: string, currentRoomId: string | null) => {
    if (!selectedRoom || !trip) return;

    const removing = currentRoomId === selectedRoom.id;
    const user = users.find((u) => u.id === userId);

    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u;
        if (removing) return { ...u, room_id: null, room_number: null };
        return { ...u, room_id: selectedRoom.id, room_number: selectedRoom.room_number };
      })
    );

    const newAssignment = {
      id: `temp-${userId}`,
      user_id: userId,
      trip_id: trip.id,
      user: user
        ? { id: user.id, display_name: user.display_name, full_name: user.full_name, avatar_url: user.avatar_url }
        : null,
    };

    setSelectedRoom((prev) => {
      if (!prev) return prev;
      if (removing) {
        return { ...prev, room_assignments: prev.room_assignments.filter((a) => a.user_id !== userId) };
      }
      return { ...prev, room_assignments: [...prev.room_assignments, newAssignment] };
    });

    setRooms((prev) =>
      prev.map((r) => {
        if (r.id === selectedRoom.id) {
          if (removing) return { ...r, room_assignments: r.room_assignments.filter((a) => a.user_id !== userId) };
          return { ...r, room_assignments: [...r.room_assignments, newAssignment] };
        }
        if (!removing && currentRoomId && r.id === currentRoomId) {
          return { ...r, room_assignments: r.room_assignments.filter((a) => a.user_id !== userId) };
        }
        return r;
      })
    );

    const method = removing ? "DELETE" : "POST";
    const res = await fetch("/api/admin/rooms/assignments", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: selectedRoom.id, user_id: userId, trip_id: trip.id }),
    });

    if (!res.ok) {
      const updatedRooms = await fetchRooms(trip.id);
      await fetchUsers(trip.id);
      const fresh = (updatedRooms as Room[]).find((r: Room) => r.id === selectedRoom.id);
      if (fresh) setSelectedRoom(fresh);
    }
  };

  const clearAllAssignments = () => {
    if (!trip) return;
    const assignedCount = users.filter((u) => u.room_id).length;
    if (assignedCount === 0) return;

    setConfirmModal({
      title: "Clear All Assignments",
      message: `This will remove all ${assignedCount} room assignment${assignedCount !== 1 ? "s" : ""}. Everyone will become unassigned.`,
      onConfirm: async () => {
        setConfirmModal(null);
        setSaving("clear-all");

        for (const user of users) {
          if (user.room_id) {
            await fetch("/api/admin/rooms/assignments", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ room_id: user.room_id, user_id: user.id, trip_id: trip.id }),
            });
          }
        }

        await Promise.all([fetchRooms(trip.id), fetchUsers(trip.id)]);
        setSaving(null);
      },
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        No active event found.
      </div>
    );
  }

  const linkedFacilities = facilities.filter((f) => linkedFacilityIds.includes(f.id));
  const unassigned = users.filter((u) => !u.room_id);
  const anyAssigned = users.some((u) => u.room_id);

  // Drawer: show only unassigned Loozers + those already in this room
  const drawerUsers = selectedRoom
    ? users.filter((u) => !u.room_id || u.room_id === selectedRoom.id)
    : [];

  const assignedToSelected = selectedRoom
    ? users.filter((u) => u.room_id === selectedRoom.id).length
    : 0;

  if (linkedFacilities.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4 text-center">
        No facilities linked to this event. Link facilities first.
      </p>
    );
  }

  return (
    <div>
      {unassigned.length > 0 && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
          {unassigned.length} Loozer{unassigned.length !== 1 ? "s" : ""} unassigned:{" "}
          {unassigned.map((u) => u.display_name || u.full_name || "Unknown").join(", ")}
        </div>
      )}

      {anyAssigned && (
        <div className="flex justify-end mb-3">
          <button
            onClick={clearAllAssignments}
            disabled={saving === "clear-all"}
            className="text-xs text-red-600 font-medium px-2 py-1 rounded-lg hover:bg-red-50"
          >
            {saving === "clear-all" ? "Clearing..." : "Clear All Assignments"}
          </button>
        </div>
      )}

      <div className="divide-y divide-gray-50 -mx-4">
        {linkedFacilities.map((facility) => {
          const facilityRooms = rooms.filter((r) => r.facility_id === facility.id);

          return (
            <div key={facility.id}>
              <div className="px-4 py-2 bg-gray-50">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {facility.name}
                </span>
              </div>
              {facilityRooms.length === 0 ? (
                <div className="px-4 py-3 text-xs text-gray-400">No rooms in this facility</div>
              ) : (
                facilityRooms.map((room) => {
                  const occupants = room.room_assignments || [];
                  const names = occupants.map((a) => a.user?.display_name).filter(Boolean);

                  return (
                    <button
                      key={room.id}
                      onClick={() => openDrawer(room)}
                      className="w-full flex items-center px-4 py-3 text-left active:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          Room {room.room_number}
                        </div>
                        {names.length > 0 ? (
                          <div className="text-xs text-gray-500">{names.join(", ")}</div>
                        ) : (
                          <div className="text-xs text-gray-400 italic">Empty</div>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mr-2">
                        {room.bed_type}
                        {room.smoking ? " · Smoking" : ""}
                      </div>
                      <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  );
                })
              )}
            </div>
          );
        })}
      </div>

      <BottomDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={selectedRoom ? `Room ${selectedRoom.room_number}` : ""}
        subtitle={
          selectedRoom
            ? `${facilities.find((f) => f.id === selectedRoom.facility_id)?.name || ""} · ${selectedRoom.bed_type}${selectedRoom.smoking ? " · Smoking" : ""} · ${assignedToSelected} assigned`
            : undefined
        }
      >
        <div className="divide-y divide-gray-50">
          {drawerUsers.map((user) => {
            const inThisRoom = user.room_id === selectedRoom?.id;

            return (
              <button
                key={user.id}
                onClick={() => toggleAssignment(user.id, user.room_id)}
                disabled={saving !== null}
                className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50 transition-colors"
              >
                <div
                  className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    inThisRoom ? "bg-green-600 border-green-600" : "border-gray-300"
                  }`}
                >
                  {inThisRoom && (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-sm font-bold">
                    {(user.display_name || "?")[0].toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-medium text-gray-900 flex-1">
                  {user.display_name || user.full_name || "Unknown"}
                </span>
                {saving === user.id && (
                  <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                )}
              </button>
            );
          })}
          {drawerUsers.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              All Loozers are assigned to other rooms.
            </div>
          )}
        </div>
      </BottomDrawer>

      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        confirmLabel="Clear All"
        destructive
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
