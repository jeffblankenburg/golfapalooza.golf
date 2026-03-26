"use client";

import { useState, useEffect } from "react";
import type { CourseTee } from "@/types/golf";

export interface PlayerConfig {
  user_id: string;
  display_name: string;
  tee_id: string;
  is_scorer: boolean;
}

interface User {
  id: string;
  display_name: string;
  full_name: string | null;
}

interface PlayerSetupProps {
  defaultTee: CourseTee;
  availableTees: CourseTee[];
  currentUserId: string;
  currentUserName: string;
  players: PlayerConfig[];
  onPlayersChange: (players: PlayerConfig[]) => void;
}

export function PlayerSetup({
  defaultTee,
  availableTees,
  currentUserId,
  currentUserName,
  players,
  onPlayersChange,
}: PlayerSetupProps) {
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);

  useEffect(() => {
    // Initialize with current user if no players
    if (players.length === 0) {
      onPlayersChange([
        {
          user_id: currentUserId,
          display_name: currentUserName,
          tee_id: defaultTee.id,
          is_scorer: true,
        },
      ]);
    }
  }, [currentUserId, currentUserName, defaultTee.id, players.length, onPlayersChange]);

  useEffect(() => {
    async function fetchUsers() {
      setIsLoadingUsers(true);
      try {
        const response = await fetch("/api/admin/users");
        const data = await response.json();
        if (response.ok) {
          setAvailableUsers(data.users || []);
        }
      } catch (err) {
        console.error("Failed to fetch users:", err);
      } finally {
        setIsLoadingUsers(false);
      }
    }

    if (showAddPlayer) {
      fetchUsers();
    }
  }, [showAddPlayer]);

  const addPlayer = (user: User) => {
    if (players.length >= 4) return;
    if (players.some((p) => p.user_id === user.id)) return;

    onPlayersChange([
      ...players,
      {
        user_id: user.id,
        display_name: user.display_name,
        tee_id: defaultTee.id,
        is_scorer: false,
      },
    ]);
    setShowAddPlayer(false);
  };

  const removePlayer = (userId: string) => {
    if (userId === currentUserId) return;
    onPlayersChange(players.filter((p) => p.user_id !== userId));
  };

  const updatePlayerTee = (userId: string, teeId: string) => {
    onPlayersChange(
      players.map((p) => (p.user_id === userId ? { ...p, tee_id: teeId } : p))
    );
  };

  const toggleScorer = (userId: string) => {
    onPlayersChange(
      players.map((p) => (p.user_id === userId ? { ...p, is_scorer: !p.is_scorer } : p))
    );
  };

  const availableToAdd = availableUsers.filter(
    (u) => !players.some((p) => p.user_id === u.id)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          Players ({players.length}/4)
        </label>
        {players.length < 4 && (
          <button
            type="button"
            onClick={() => setShowAddPlayer(!showAddPlayer)}
            className="text-sm text-green-600 hover:text-green-800 font-medium"
          >
            + Add Player
          </button>
        )}
      </div>

      <div className="space-y-3">
        {players.map((player, index) => (
          <div
            key={player.user_id}
            className="bg-white border border-gray-200 rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-sm font-medium">
                  {index + 1}
                </span>
                <span className="font-medium text-gray-900">
                  {player.display_name}
                  {player.user_id === currentUserId && (
                    <span className="text-gray-500 text-sm ml-1">(you)</span>
                  )}
                </span>
              </div>
              {player.user_id !== currentUserId && (
                <button
                  type="button"
                  onClick={() => removePlayer(player.user_id)}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tees</label>
                <select
                  value={player.tee_id}
                  onChange={(e) => updatePlayerTee(player.user_id, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white"
                >
                  {availableTees.map((tee) => (
                    <option key={tee.id} value={tee.id}>
                      {tee.tee_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Scorer</label>
                <button
                  type="button"
                  onClick={() => toggleScorer(player.user_id)}
                  className={`w-full px-3 py-2 border rounded-md text-sm transition-colors ${
                    player.is_scorer
                      ? "bg-green-50 border-green-300 text-green-700"
                      : "bg-gray-50 border-gray-300 text-gray-500"
                  }`}
                >
                  {player.is_scorer ? "Can Enter Scores" : "View Only"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showAddPlayer && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Add a Player</h4>
          {isLoadingUsers ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin h-6 w-6 border-2 border-green-500 border-t-transparent rounded-full" />
            </div>
          ) : availableToAdd.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-2">
              No other players available
            </p>
          ) : (
            <div className="grid gap-2 max-h-40 overflow-y-auto">
              {availableToAdd.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => addPlayer(user)}
                  className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-colors text-left"
                >
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-medium text-gray-600">
                    {user.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{user.display_name}</div>
                    {user.full_name && (
                      <div className="text-xs text-gray-500">{user.full_name}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowAddPlayer(false)}
            className="mt-3 w-full text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Each player can play from different tees. Players marked as &quot;Scorer&quot; can enter
        scores for themselves during the round.
      </p>
    </div>
  );
}
