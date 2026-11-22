/**
 * v2 Lodging ("Rooms") shared types, constants, and payload normalizers.
 *
 * Model: property (a hotel or a single rental) → room (a sleeping space) →
 * assignment (who's staying there). Fields are a universal nullable set so a
 * numbered hotel room and a named Airbnb bedroom both fit one schema. See
 * migration 00300_v2_lodging.sql.
 */

export const PROPERTY_KINDS = [
  { key: "hotel", label: "Hotel" },
  { key: "house", label: "House / rental" },
  { key: "other", label: "Other" },
] as const;
export type PropertyKind = (typeof PROPERTY_KINDS)[number]["key"];

/** Bed configs offered in the room form. Stored as free text, so this list can grow. */
export const BED_TYPES = ["King", "Queen", "Double", "Full", "Twin", "Bunk", "Sofa"] as const;

export interface LodgingImage {
  id: string;
  property_id: string;
  url: string;
  caption: string | null;
  sort_order: number;
}

export interface LodgingProperty {
  id: string;
  event_id: string;
  name: string;
  kind: string | null;
  address: string | null;
  listing_url: string | null;
  notes: string | null;
  sort_order: number;
  images?: LodgingImage[];
}

export interface LodgingRoom {
  id: string;
  property_id: string;
  event_id: string;
  label: string;
  floor: string | null;
  bed_type: string | null;
  bed_count: number | null;
  capacity: number | null;
  smoking: boolean;
  pet_friendly: boolean;
  accessible: boolean;
  private_bath: boolean;
  notes: string | null;
  sort_order: number;
}

export interface LodgingAssignment {
  id: string;
  room_id: string;
  user_id: string;
}

export const PROPERTY_SELECT =
  "id, event_id, name, kind, address, listing_url, notes, sort_order";
export const IMAGE_SELECT = "id, property_id, url, caption, sort_order";
export const ROOM_SELECT =
  "id, property_id, event_id, label, floor, bed_type, bed_count, capacity, smoking, pet_friendly, accessible, private_bath, notes, sort_order";
export const ASSIGNMENT_SELECT = "id, room_id, user_id";

/* ── Payload normalizers (shared by the create/update API routes) ───────────── */

function str(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Validate/clean a property create or PATCH body. Returns `{error}` when invalid. */
export function normalizeProperty(
  body: Record<string, unknown>,
  { partial = false }: { partial?: boolean } = {},
): Record<string, unknown> | { error: string } {
  const out: Record<string, unknown> = {};
  if ("name" in body || !partial) {
    const name = str(body.name, 120);
    if (!name) return { error: "A property name is required" };
    out.name = name;
  }
  if ("kind" in body) {
    const kind = str(body.kind, 20);
    out.kind = kind && PROPERTY_KINDS.some((k) => k.key === kind) ? kind : null;
  }
  if ("address" in body) out.address = str(body.address, 300);
  if ("listing_url" in body) out.listing_url = str(body.listing_url, 500);
  if ("notes" in body) out.notes = str(body.notes, 2000);
  if ("sort_order" in body) out.sort_order = intOrNull(body.sort_order) ?? 0;
  return out;
}

/** Validate/clean a room create or PATCH body. Returns `{error}` when invalid. */
export function normalizeRoom(
  body: Record<string, unknown>,
  { partial = false }: { partial?: boolean } = {},
): Record<string, unknown> | { error: string } {
  const out: Record<string, unknown> = {};
  if ("label" in body || !partial) {
    const label = str(body.label, 80);
    if (!label) return { error: "A room name or number is required" };
    out.label = label;
  }
  if ("floor" in body) out.floor = str(body.floor, 40);
  if ("bed_type" in body) out.bed_type = str(body.bed_type, 40);
  if ("bed_count" in body) out.bed_count = intOrNull(body.bed_count);
  if ("capacity" in body) out.capacity = intOrNull(body.capacity);
  for (const flag of ["smoking", "pet_friendly", "accessible", "private_bath"] as const) {
    if (flag in body) out[flag] = body[flag] === true;
  }
  if ("notes" in body) out.notes = str(body.notes, 2000);
  if ("sort_order" in body) out.sort_order = intOrNull(body.sort_order) ?? 0;
  return out;
}
