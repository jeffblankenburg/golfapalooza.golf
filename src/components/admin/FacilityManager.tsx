"use client";

import { useState, useEffect, useCallback, useImperativeHandle, type Ref } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { DragHandle } from "@/components/DragHandle";

interface Room {
  id: string;
  room_number: string;
  facility_id: string | null;
  smoking: boolean;
  showers: number;
  bed_type: string;
  handicapped: boolean;
  pet_friendly: boolean;
}

interface Facility {
  id: string;
  name: string;
  sort_order: number;
}

export function FacilityManager({ ref }: { ref?: Ref<{ openAdd: () => void }> }) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Facility modal
  const [showFacilityModal, setShowFacilityModal] = useState(false);
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
  const [facilityName, setFacilityName] = useState("");

  // Room modal
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [roomNumber, setRoomNumber] = useState("");
  const [roomSmoking, setRoomSmoking] = useState(false);
  const [roomShowers, setRoomShowers] = useState(1);
  const [roomBedType, setRoomBedType] = useState("Double");
  const [roomHandicapped, setRoomHandicapped] = useState(false);
  const [roomPetFriendly, setRoomPetFriendly] = useState(false);

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  useImperativeHandle(ref, () => ({ openAdd: openAddFacility }));

  // ── Data Fetching ──

  const fetchRooms = useCallback(async () => {
    const res = await fetch("/api/admin/rooms/facilities");
    const data = await res.json();
    const allFacilities: Facility[] = data.facilities || [];
    setFacilities(allFacilities);

    if (allFacilities.length === 0) {
      setRooms([]);
      return;
    }

    const allRooms: Room[] = [];
    for (const f of allFacilities) {
      const roomRes = await fetch(`/api/admin/rooms?facility_id=${f.id}`);
      const roomData = await roomRes.json();
      if (roomData.rooms) {
        allRooms.push(...roomData.rooms.map((r: Room) => ({ ...r, facility_id: f.id })));
      }
    }
    setRooms(allRooms);
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await fetchRooms();
      setLoading(false);
    }
    init();
  }, [fetchRooms]);

  // ── Facility Modal ──

  const openAddFacility = () => {
    setEditingFacility(null);
    setFacilityName("");
    setError("");
    setShowFacilityModal(true);
  };

  const openEditFacility = (facility: Facility) => {
    setEditingFacility(facility);
    setFacilityName(facility.name);
    setError("");
    setShowFacilityModal(true);
  };

  const closeFacilityModal = () => {
    setShowFacilityModal(false);
    setEditingFacility(null);
    setError("");
  };

  const handleSaveFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facilityName.trim()) return;
    setSaving(true);
    setError("");

    if (editingFacility) {
      const res = await fetch("/api/admin/rooms/facilities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingFacility.id, name: facilityName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update facility");
        setSaving(false);
        return;
      }
    } else {
      const res = await fetch("/api/admin/rooms/facilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: facilityName.trim(),
          sort_order: facilities.length,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create facility");
        setSaving(false);
        return;
      }
    }

    await fetchRooms();
    closeFacilityModal();
    setSaving(false);
  };

  const handleDeleteFacility = (facility: Facility) => {
    const facilityRooms = rooms.filter((r) => r.facility_id === facility.id);
    const msg =
      facilityRooms.length > 0
        ? `This will permanently delete "${facility.name}" and its ${facilityRooms.length} room${facilityRooms.length !== 1 ? "s" : ""}.`
        : `This will permanently delete "${facility.name}".`;

    setConfirmModal({
      title: "Delete Facility",
      message: msg,
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch("/api/admin/rooms/facilities", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: facility.id }),
        });
        closeFacilityModal();
        await fetchRooms();
      },
    });
  };

  // ── Room Modal ──

  const openAddRoom = () => {
    setEditingRoom(null);
    setRoomNumber("");
    setRoomSmoking(false);
    setRoomShowers(1);
    setRoomBedType("Double");
    setRoomHandicapped(false);
    setRoomPetFriendly(false);
    setError("");
    setShowRoomModal(true);
  };

  const openEditRoom = (room: Room) => {
    setEditingRoom(room);
    setRoomNumber(room.room_number);
    setRoomSmoking(room.smoking);
    setRoomShowers(room.showers);
    setRoomBedType(room.bed_type);
    setRoomHandicapped(room.handicapped);
    setRoomPetFriendly(room.pet_friendly);
    setError("");
    setShowRoomModal(true);
  };

  const closeRoomModal = () => {
    setShowRoomModal(false);
    setEditingRoom(null);
    setError("");
  };

  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomNumber.trim() || !editingFacility) return;
    setSaving(true);
    setError("");

    if (editingRoom) {
      const res = await fetch("/api/admin/rooms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRoom.id,
          smoking: roomSmoking,
          showers: roomShowers,
          bed_type: roomBedType,
          handicapped: roomHandicapped,
          pet_friendly: roomPetFriendly,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update room");
        setSaving(false);
        return;
      }
    } else {
      const res = await fetch("/api/admin/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_number: roomNumber.trim(),
          facility_id: editingFacility.id,
          smoking: roomSmoking,
          showers: roomShowers,
          bed_type: roomBedType,
          handicapped: roomHandicapped,
          pet_friendly: roomPetFriendly,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create room");
        setSaving(false);
        return;
      }
    }

    await fetchRooms();
    closeRoomModal();
    setSaving(false);
  };

  const handleDeleteRoom = (room: Room) => {
    setConfirmModal({
      title: "Delete Room",
      message: `This will permanently delete Room ${room.room_number}.`,
      onConfirm: async () => {
        setConfirmModal(null);
        closeRoomModal();
        await fetch("/api/admin/rooms", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: room.id }),
        });
        await fetchRooms();
      },
    });
  };

  // ── Loading State ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Render ──

  const facilityRooms = editingFacility
    ? rooms.filter((r) => r.facility_id === editingFacility.id)
    : [];

  return (
    <div>
      <div className="space-y-2">
        {facilities.map((facility) => {
          const fRooms = rooms.filter((r) => r.facility_id === facility.id);

          return (
            <button
              key={facility.id}
              onClick={() => openEditFacility(facility)}
              className="w-full bg-white rounded-xl border border-gray-200 px-3 py-2.5 flex items-center gap-3 active:bg-gray-50 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">
                  {facility.name}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {fRooms.length} room{fRooms.length !== 1 ? "s" : ""}
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[0.6875rem] font-semibold flex-shrink-0 bg-gray-100 text-gray-500">
                {fRooms.length}
              </span>
              <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          );
        })}

        {facilities.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            <p className="text-sm">
              No facilities yet. Add one to get started.
            </p>
          </div>
        )}
      </div>

      {/* Facility Add/Edit Modal */}
      {showFacilityModal && (
        <div className="fixed top-14 bottom-16 left-0 right-0 z-35 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeFacilityModal} />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up max-h-[calc(100%-12px)] flex flex-col">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
              <DragHandle onClose={closeFacilityModal} className="mb-4" />
              <h2 className="text-xl font-bold text-gray-900">
                {editingFacility ? `Edit '${editingFacility.name}'` : "New Facility"}
              </h2>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4">
              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">
                  {error}
                </div>
              )}

              <form id="facility-form" onSubmit={handleSaveFacility} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Facility Name
                  </label>
                  <input
                    type="text"
                    value={facilityName}
                    onChange={(e) => setFacilityName(e.target.value)}
                    placeholder="e.g. Main Lodge"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base"
                    required
                  />
                </div>
              </form>

              {/* Rooms section — only when editing an existing facility */}
              {editingFacility && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                      Rooms ({facilityRooms.length})
                    </h3>
                    <button
                      onClick={openAddRoom}
                      className="text-xs font-medium text-green-700 active:text-green-900"
                    >
                      + Add Room
                    </button>
                  </div>

                  {facilityRooms.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      No rooms yet
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {facilityRooms.map((room) => (
                        <button
                          key={room.id}
                          onClick={() => openEditRoom(room)}
                          className="w-full bg-gray-50 rounded-xl px-3 py-2.5 flex items-center gap-3 active:bg-gray-100 transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-gray-500">
                              {room.room_number}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 text-sm truncate">
                              Room {room.room_number}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                              {room.bed_type}
                              {" · "}
                              {room.showers} shower{room.showers !== 1 ? "s" : ""}
                              {room.smoking && " 🚬"}
                              {room.handicapped && " ♿"}
                              {room.pet_friendly && " 🐾"}
                            </p>
                          </div>
                          <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <button
                      onClick={() => handleDeleteFacility(editingFacility)}
                      className="text-sm text-red-500 font-medium"
                    >
                      Delete Facility
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <button
                type="submit"
                form="facility-form"
                disabled={saving}
                className="flex-1 bg-green-600 text-white py-3 rounded-xl font-semibold text-[0.9375rem] disabled:bg-gray-300 active:bg-green-700"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={closeFacilityModal}
                className="flex-1 py-3 border border-gray-300 rounded-xl font-semibold text-[0.9375rem] text-gray-600 active:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room Add/Edit Modal (stacks on top of facility modal) */}
      {showRoomModal && (
        <div className="fixed top-14 bottom-16 left-0 right-0 z-40 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeRoomModal} />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up max-h-[calc(100%-12px)] flex flex-col">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
              <DragHandle onClose={closeRoomModal} className="mb-4" />
              <h2 className="text-xl font-bold text-gray-900">
                {editingRoom ? `Edit Room ${editingRoom.room_number}` : "New Room"}
              </h2>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4">
              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">
                  {error}
                </div>
              )}

              <form id="room-form" onSubmit={handleSaveRoom} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Room Number
                  </label>
                  <input
                    type="text"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    placeholder="e.g. 101"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base"
                    required
                    disabled={!!editingRoom}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Bed Type
                  </label>
                  <select
                    value={roomBedType}
                    onChange={(e) => setRoomBedType(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base bg-white"
                  >
                    <option value="Double">Double</option>
                    <option value="King">King</option>
                    <option value="Queen">Queen</option>
                    <option value="Twin">Twin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Showers
                  </label>
                  <select
                    value={roomShowers}
                    onChange={(e) => setRoomShowers(parseInt(e.target.value))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base bg-white"
                  >
                    <option value={0}>0</option>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={roomSmoking}
                    onChange={(e) => setRoomSmoking(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  🚬 Smoking
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={roomHandicapped}
                    onChange={(e) => setRoomHandicapped(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  ♿ Handicap Accessible
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={roomPetFriendly}
                    onChange={(e) => setRoomPetFriendly(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  🐾 Pet Friendly
                </label>
              </form>

              {editingRoom && (
                <div className="mt-6 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => handleDeleteRoom(editingRoom)}
                    className="text-sm text-red-500 font-medium"
                  >
                    Delete Room
                  </button>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <button
                type="submit"
                form="room-form"
                disabled={saving}
                className="flex-1 bg-green-600 text-white py-3 rounded-xl font-semibold text-[0.9375rem] disabled:bg-gray-300 active:bg-green-700"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={closeRoomModal}
                className="flex-1 py-3 border border-gray-300 rounded-xl font-semibold text-[0.9375rem] text-gray-600 active:bg-gray-50"
              >
                Cancel
              </button>
            </div>
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
