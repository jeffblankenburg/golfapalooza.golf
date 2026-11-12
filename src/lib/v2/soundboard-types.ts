/**
 * Shared Soundboard types + constants (client- and server-safe, pure).
 *
 * The board is an operator tool (admins + members granted `manage_soundboard`).
 * A "blast" is broadcast over a Supabase realtime channel so every member hears
 * the clip; receivers play it straight from its public `audioUrl`.
 */

export const SOUNDBOARD_BUCKET = "v2-soundboard";

/** Realtime broadcast channel for a group's soundboard blasts. */
export function soundboardChannel(orgId: string): string {
  return `soundboard:${orgId}`;
}

export interface SoundboardTag {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
}

export interface Sound {
  id: string;
  name: string;
  audio_url: string;
  emoji: string | null;
  image_url: string | null;
  play_count: number;
  sort_order: number;
  tag_ids: string[];
}

/** The single payload the drawer loads on open; everything else is client-side. */
export interface SoundboardData {
  sounds: Sound[];
  tags: SoundboardTag[];
  /** The caller's own sound ids, most-played first (for the "My most played" row). */
  myTop: string[];
}

/** The realtime blast event. `audioUrl` is public, so receivers need no catalog read. */
export interface BlastPayload {
  soundId: string;
  audioUrl: string;
  name: string;
  fromUserId: string;
  fromName: string;
}

export const BLAST_EVENT = "blast";
