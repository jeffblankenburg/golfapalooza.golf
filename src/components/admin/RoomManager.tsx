"use client";

import { useState, useEffect, useCallback } from "react";
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

type View = "facilities" | "facility-rooms" | "room-detail";

export function RoomManager({ tripId: propTripId }: { tripId?: string } = {}) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [linkedFacilityIds, setLinkedFacilityIds] = useState<string[]>([]);
  const [users, setUsers] = useState<UserWithRoom[]>([]);
  const [view, setView] = useState<View>("facilities");
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Edit facility name
  const [editingFacilityId, setEditingFacilityId] = useState<string | null>(null);
  const [editFacilityName, setEditFacilityName] = useState("");

  // New facility form
  const [showNewFacility, setShowNewFacility] = useState(false);
  const [newFacilityName, setNewFacilityName] = useState("");

  // New room form
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState("");
  const [newRoomSmoking, setNewRoomSmoking] = useState(false);
  const [newRoomShowers, setNewRoomShowers] = useState(1);
  const [newRoomBedType, setNewRoomBedType] = useState("Double");

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

  // ── Facility CRUD ──

  const createFacility = async () => {
    if (!trip || !newFacilityName.trim()) return;
    setSaving("new-facility");

    const res = await fetch("/api/admin/rooms/facilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newFacilityName.trim(),
        sort_order: facilities.length,
        trip_id: trip.id,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create facility");
      setSaving(null);
      return;
    }

    await fetchRooms(trip.id);
    setNewFacilityName("");
    setShowNewFacility(false);
    setSaving(null);
  };

  const toggleFacilityLink = async (facilityId: string, currentlyLinked: boolean) => {
    if (!trip) return;
    setSaving(`link-${facilityId}`);

    await fetch("/api/admin/rooms/facilities", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        facility_id: facilityId,
        trip_id: trip.id,
        linked: !currentlyLinked,
      }),
    });

    await fetchRooms(trip.id);
    setSaving(null);
  };

  const renameFacility = async (facilityId: string) => {
    if (!trip || !editFacilityName.trim()) return;
    setSaving(`rename-${facilityId}`);

    const res = await fetch("/api/admin/rooms/facilities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: facilityId, name: editFacilityName.trim() }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to rename facility");
      setSaving(null);
      return;
    }

    await fetchRooms(trip.id);
    setEditingFacilityId(null);
    setEditFacilityName("");
    setSaving(null);
  };

  const deleteFacility = (facilityId: string) => {
    if (!trip) return;
    const facilityRooms = rooms.filter((r) => r.facility_id === facilityId);
    const facility = facilities.find((f) => f.id === facilityId);
    const msg =
      facilityRooms.length > 0
        ? `This will permanently delete "${facility?.name}" and its ${facilityRooms.length} room${facilityRooms.length !== 1 ? "s" : ""}. Occupants will become unassigned.`
        : `This will permanently delete "${facility?.name}".`;

    setConfirmModal({
      title: "Delete Facility",
      message: msg,
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch("/api/admin/rooms/facilities", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: facilityId }),
        });
        await Promise.all([fetchRooms(trip.id), fetchUsers(trip.id)]);
      },
    });
  };

  // ── Room CRUD ──

  const createRoom = async () => {
    if (!trip || !selectedFacility || !newRoomNumber.trim()) return;
    setSaving("new-room");

    const res = await fetch("/api/admin/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_number: newRoomNumber.trim(),
        facility_id: selectedFacility.id,
        smoking: newRoomSmoking,
        showers: newRoomShowers,
        bed_type: newRoomBedType,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create room");
      setSaving(null);
      return;
    }

    await fetchRooms(trip.id);
    setNewRoomNumber("");
    setNewRoomSmoking(false);
    setNewRoomShowers(1);
    setNewRoomBedType("Double");
    setShowNewRoom(false);
    setSaving(null);
  };

  const deleteRoom = (roomId: string) => {
    if (!trip) return;
    const room = rooms.find((r) => r.id === roomId);

    setConfirmModal({
      title: "Delete Room",
      message: `This will permanently delete Room ${room?.room_number || ""}. Occupants will become unassigned.`,
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch("/api/admin/rooms", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: roomId }),
        });
        await Promise.all([fetchRooms(trip.id), fetchUsers(trip.id)]);
      },
    });
  };

  // ── Room Assignment ──

  const toggleAssignment = async (userId: string, currentRoomId: string | null) => {
    if (!selectedRoom || !trip) return;

    const removing = currentRoomId === selectedRoom.id;
    const user = users.find((u) => u.id === userId);

    // Optimistically update users list
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u;
        if (removing) {
          return { ...u, room_id: null, room_number: null };
        }
        return { ...u, room_id: selectedRoom.id, room_number: selectedRoom.room_number };
      })
    );

    // Optimistically update selectedRoom assignments
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
        return {
          ...prev,
          room_assignments: prev.room_assignments.filter((a) => a.user_id !== userId),
        };
      }
      return {
        ...prev,
        room_assignments: [...prev.room_assignments, newAssignment],
      };
    });

    // Also update rooms array so facility-rooms view stays in sync
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id === selectedRoom.id) {
          if (removing) {
            return { ...r, room_assignments: r.room_assignments.filter((a) => a.user_id !== userId) };
          }
          return { ...r, room_assignments: [...r.room_assignments, newAssignment] };
        }
        // If adding, remove from previous room
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
      // Revert on failure
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== userId) return u;
          if (removing) {
            return { ...u, room_id: selectedRoom.id, room_number: selectedRoom.room_number };
          }
          return { ...u, room_id: currentRoomId, room_number: user?.room_number ?? null };
        })
      );
      setSelectedRoom((prev) => prev); // will be corrected by refetch
      // Refetch to get correct state
      const updatedRooms = await fetchRooms(trip.id);
      await fetchUsers(trip.id);
      const fresh = (updatedRooms as Room[]).find((r: Room) => r.id === selectedRoom.id);
      if (fresh) setSelectedRoom(fresh);
    }
  };

  // ── Loading / Empty States ──

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="text-center py-12 text-gray-500">
        No active event found. Create one in Trip Settings.
      </div>
    );
  }

  const unassigned = users.filter((u) => !u.room_id);

  // ── Facilities List View ──
  if (view === "facilities") {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Room Assignments
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {trip.trip_name} {trip.trip_year}
        </p>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Facilities */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-6">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">
              Facilities ({facilities.length})
            </h2>
            <button
              onClick={() => setShowNewFacility(!showNewFacility)}
              className="text-xs text-green-700 font-medium px-2 py-1 rounded-lg hover:bg-green-50"
            >
              + Add
            </button>
          </div>

          {showNewFacility && (
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <input
                type="text"
                placeholder="Facility name (e.g. Main Lodge)"
                autoFocus
                value={newFacilityName}
                onChange={(e) => setNewFacilityName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px] mb-2"
                onKeyDown={(e) => {
                  if (e.key === "Enter") createFacility();
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={createFacility}
                  disabled={!newFacilityName.trim() || saving === "new-facility"}
                  className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                >
                  {saving === "new-facility" ? "Creating..." : "Create"}
                </button>
                <button
                  onClick={() => {
                    setShowNewFacility(false);
                    setNewFacilityName("");
                  }}
                  className="px-4 text-sm text-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="divide-y divide-gray-50">
            {facilities.map((facility) => {
              const isLinked = linkedFacilityIds.includes(facility.id);
              const isEditing = editingFacilityId === facility.id;
              const facilityRooms = rooms.filter(
                (r) => r.facility_id === facility.id
              );
              const occupantCount = facilityRooms.reduce(
                (sum, r) => sum + (r.room_assignments?.length || 0),
                0
              );
              return (
                <div key={facility.id} className="flex items-center px-4 py-3">
                  <button
                    onClick={() => toggleFacilityLink(facility.id, isLinked)}
                    disabled={saving === `link-${facility.id}`}
                    className="mr-3 flex-shrink-0"
                    title={isLinked ? "Unlink from this event" : "Link to this event"}
                  >
                    <div
                      className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                        isLinked
                          ? "bg-green-600 border-green-600"
                          : "border-gray-300"
                      }`}
                    >
                      {isLinked && (
                        <svg
                          className="w-4 h-4 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                  </button>
                  {isEditing ? (
                    <div className="flex-1 mr-2">
                      <input
                        type="text"
                        autoFocus
                        value={editFacilityName}
                        onChange={(e) => setEditFacilityName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameFacility(facility.id);
                          if (e.key === "Escape") {
                            setEditingFacilityId(null);
                            setEditFacilityName("");
                          }
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                      />
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => renameFacility(facility.id)}
                          disabled={!editFacilityName.trim() || saving === `rename-${facility.id}`}
                          className="text-xs text-green-700 font-medium"
                        >
                          {saving === `rename-${facility.id}` ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => {
                            setEditingFacilityId(null);
                            setEditFacilityName("");
                          }}
                          className="text-xs text-gray-500"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setSelectedFacility(facility);
                        setView("facility-rooms");
                      }}
                      className="flex-1 text-left"
                    >
                      <div className="text-sm font-medium text-gray-900">
                        {facility.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {facilityRooms.length} room
                        {facilityRooms.length !== 1 ? "s" : ""} &middot;{" "}
                        {occupantCount} occupant
                        {occupantCount !== 1 ? "s" : ""}
                        {!isLinked && (
                          <span className="text-amber-500 ml-1">(not linked to event)</span>
                        )}
                      </div>
                    </button>
                  )}
                  {!isEditing && (
                    <>
                      <button
                        onClick={() => {
                          setEditingFacilityId(facility.id);
                          setEditFacilityName(facility.name);
                        }}
                        className="text-gray-300 hover:text-gray-500 p-1 mr-1"
                        title="Rename"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedFacility(facility);
                          setView("facility-rooms");
                        }}
                        className="text-xs text-green-700 font-medium px-3 py-1.5 rounded-lg hover:bg-green-50 mr-1"
                      >
                        Manage
                      </button>
                      <button
                        onClick={() => deleteFacility(facility.id)}
                        className="text-gray-300 hover:text-red-500 p-1"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              );
            })}
            {facilities.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No facilities yet. Add a facility to start creating rooms.
              </div>
            )}
          </div>
        </div>

        {/* Unassigned */}
        {unassigned.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">
                Unassigned Loozers ({unassigned.length})
              </h2>
            </div>
            <div className="divide-y divide-gray-50">
              {unassigned.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-sm font-bold">
                      {(user.display_name || "?")[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-900">
                    {user.display_name || user.full_name || "Unknown"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <ConfirmModal
          open={!!confirmModal}
          title={confirmModal?.title || ""}
          message={confirmModal?.message || ""}
          confirmLabel="Delete"
          destructive
          onConfirm={() => confirmModal?.onConfirm()}
          onCancel={() => setConfirmModal(null)}
        />
      </div>
    );
  }

  // ── Facility Rooms View ──
  if (view === "facility-rooms" && selectedFacility) {
    const facilityRooms = rooms.filter(
      (r) => r.facility_id === selectedFacility.id
    );

    return (
      <div>
        <button
          onClick={() => {
            setView("facilities");
            setSelectedFacility(null);
          }}
          className="flex items-center gap-1 text-green-700 text-sm font-medium mb-4"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Facilities
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {selectedFacility.name}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Manage rooms in this facility
        </p>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">
              Rooms ({facilityRooms.length})
            </h2>
            <button
              onClick={() => setShowNewRoom(!showNewRoom)}
              className="text-xs text-green-700 font-medium px-2 py-1 rounded-lg hover:bg-green-50"
            >
              + Add
            </button>
          </div>

          {showNewRoom && (
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 space-y-2">
              <input
                type="text"
                placeholder="Room number (e.g. 101)"
                autoFocus
                value={newRoomNumber}
                onChange={(e) => setNewRoomNumber(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px] bg-white"
              />
              <div className="flex gap-2">
                <select
                  value={newRoomBedType}
                  onChange={(e) => setNewRoomBedType(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-[16px] bg-white"
                >
                  <option value="Double">Double</option>
                  <option value="King">King</option>
                  <option value="Queen">Queen</option>
                  <option value="Twin">Twin</option>
                </select>
                <select
                  value={newRoomShowers}
                  onChange={(e) => setNewRoomShowers(parseInt(e.target.value))}
                  className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-[16px] bg-white"
                >
                  <option value={0}>0 shower</option>
                  <option value={1}>1 shower</option>
                  <option value={2}>2 showers</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={newRoomSmoking}
                  onChange={(e) => setNewRoomSmoking(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                Smoking
              </label>
              <div className="flex gap-2">
                <button
                  onClick={createRoom}
                  disabled={!newRoomNumber.trim() || saving === "new-room"}
                  className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                >
                  {saving === "new-room" ? "Creating..." : "Create"}
                </button>
                <button
                  onClick={() => {
                    setShowNewRoom(false);
                    setNewRoomNumber("");
                    setNewRoomSmoking(false);
                    setNewRoomShowers(1);
                    setNewRoomBedType("Double");
                  }}
                  className="px-4 text-sm text-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="divide-y divide-gray-50">
            {facilityRooms.map((room) => {
              const occupants = room.room_assignments || [];
              const names = occupants
                .map((a) => a.user?.display_name)
                .filter(Boolean);
              return (
                <div key={room.id} className="flex items-center px-4 py-3">
                  <button
                    onClick={() => {
                      setSelectedRoom(room);
                      setView("room-detail");
                    }}
                    className="flex-1 text-left"
                  >
                    <div className="text-sm font-medium text-gray-900">
                      Room {room.room_number}
                    </div>
                    {names.length > 0 ? (
                      <div className="text-xs text-gray-500">
                        {names.join(", ")}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 italic">Empty</div>
                    )}
                    <div className="text-xs text-gray-400 mt-0.5">
                      {room.bed_type}
                      {" · "}
                      {room.showers} shower{room.showers !== 1 ? "s" : ""}
                      {room.smoking && " · Smoking"}
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedRoom(room);
                      setView("room-detail");
                    }}
                    className="text-xs text-green-700 font-medium px-3 py-1.5 rounded-lg hover:bg-green-50 mr-1"
                  >
                    Manage
                  </button>
                  <button
                    onClick={() => deleteRoom(room.id)}
                    className="text-gray-300 hover:text-red-500 p-1"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              );
            })}
            {facilityRooms.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No rooms yet
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Room Detail View ──
  if (view === "room-detail" && selectedRoom) {
    return (
      <div>
        <button
          onClick={() => {
            setView("facility-rooms");
            setSelectedRoom(null);
          }}
          className="flex items-center gap-1 text-green-700 text-sm font-medium mb-4"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Rooms
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Room {selectedRoom.room_number}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {selectedRoom.bed_type} · {selectedRoom.showers} shower
          {selectedRoom.showers !== 1 ? "s" : ""}
          {selectedRoom.smoking ? " · Smoking" : " · Non-smoking"}
        </p>

        {/* Room Properties */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-4">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Room Properties</h2>
          </div>
          <div className="px-4 py-3 space-y-3">
            <div className="flex gap-2">
              <select
                value={selectedRoom.bed_type}
                onChange={async (e) => {
                  const bed_type = e.target.value;
                  setSelectedRoom({ ...selectedRoom, bed_type });
                  await fetch("/api/admin/rooms", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      id: selectedRoom.id,
                      smoking: selectedRoom.smoking,
                      showers: selectedRoom.showers,
                      bed_type,
                    }),
                  });
                  await fetchRooms(trip.id);
                }}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-[16px] bg-white"
              >
                <option value="Double">Double</option>
                <option value="King">King</option>
                <option value="Queen">Queen</option>
                <option value="Twin">Twin</option>
              </select>
              <select
                value={selectedRoom.showers}
                onChange={async (e) => {
                  const showers = parseInt(e.target.value);
                  setSelectedRoom({ ...selectedRoom, showers });
                  await fetch("/api/admin/rooms", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      id: selectedRoom.id,
                      smoking: selectedRoom.smoking,
                      showers,
                      bed_type: selectedRoom.bed_type,
                    }),
                  });
                  await fetchRooms(trip.id);
                }}
                className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-[16px] bg-white"
              >
                <option value={0}>0 shower</option>
                <option value={1}>1 shower</option>
                <option value={2}>2 showers</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={selectedRoom.smoking}
                onChange={async (e) => {
                  const smoking = e.target.checked;
                  setSelectedRoom({ ...selectedRoom, smoking });
                  await fetch("/api/admin/rooms", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      id: selectedRoom.id,
                      smoking,
                      showers: selectedRoom.showers,
                      bed_type: selectedRoom.bed_type,
                    }),
                  });
                  await fetchRooms(trip.id);
                }}
                className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              Smoking
            </label>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">
              {users.filter((u) => u.room_id === selectedRoom.id).length} of{" "}
              {users.length} participants
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            {users.map((user) => {
              const inThisRoom = user.room_id === selectedRoom.id;
              const inOtherRoom =
                user.room_id && user.room_id !== selectedRoom.id;

              return (
                <button
                  key={user.id}
                  onClick={() => toggleAssignment(user.id, user.room_id)}
                  disabled={saving !== null}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50 transition-colors"
                >
                  <div
                    className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      inThisRoom
                        ? "bg-green-600 border-green-600"
                        : "border-gray-300"
                    }`}
                  >
                    {inThisRoom && (
                      <svg
                        className="w-4 h-4 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-sm font-bold">
                      {(user.display_name || "?")[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900">
                      {user.display_name || user.full_name || "Unknown"}
                    </span>
                    {inOtherRoom && (
                      <p className="text-xs text-gray-400">
                        Currently in Room {user.room_number}
                      </p>
                    )}
                  </div>
                  {saving === user.id && (
                    <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  )}
                </button>
              );
            })}
            {users.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No participants. Add participants to the event first.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
