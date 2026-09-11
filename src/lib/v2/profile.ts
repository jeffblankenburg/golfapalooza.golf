/** Shared profile-field helpers for v2 members. */

export interface ProfileFields {
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  birthdate?: string | null; // YYYY-MM-DD
  zip?: string | null;
}

/** Trim to null so empty optional fields don't persist as "". */
export function cleanProfileFields(b: ProfileFields): ProfileFields {
  const s = (v?: string | null) => {
    const t = (v || "").trim();
    return t || null;
  };
  return {
    first_name: s(b.first_name),
    last_name: s(b.last_name),
    nickname: s(b.nickname),
    birthdate: s(b.birthdate),
    zip: s(b.zip),
  };
}

/** display_name = nickname, else "First Last", else the fallback. */
export function displayNameFrom(f: ProfileFields, fallback = "Member"): string {
  const nick = (f.nickname || "").trim();
  if (nick) return nick;
  const full = `${(f.first_name || "").trim()} ${(f.last_name || "").trim()}`.trim();
  return full || fallback;
}

/** Per-org member-name display mode (v2_organizations.name_display). */
export type NameMode = "nickname" | "real";

/**
 * Render a member's name per the org's mode. `nickname` mode uses the stored
 * `display_name` (already nickname-preferred). `real` mode uses "First Last",
 * falling back to display_name then the fallback. Server- and client-safe (pure).
 */
export function pickName(
  p: { display_name?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined,
  mode: NameMode,
  fallback = "Member",
): string {
  if (!p) return fallback;
  if (mode === "real") {
    const full = `${(p.first_name || "").trim()} ${(p.last_name || "").trim()}`.trim();
    if (full) return full;
  }
  return (p.display_name || "").trim() || fallback;
}
