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
