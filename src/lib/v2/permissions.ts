/**
 * v2 granular member permissions (the "group feature admin" tier — GH #178).
 *
 * A group **owner/admin** implicitly has every permission. A plain **member**
 * can be granted specific module permissions here without becoming a full admin.
 * Permissions are stored per-membership (v2_memberships.permissions JSONB) so a
 * grant only applies within that org.
 *
 * Catalog grows as v2 modules land — add an entry here (no migration needed).
 * Client- and server-safe (pure).
 */

export interface PermissionDef {
  key: string;
  label: string;
  description: string;
}
export interface PermissionGroup {
  key: string;
  label: string;
  items: PermissionDef[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "group",
    label: "Group",
    items: [
      { key: "manage_members", label: "Members", description: "Roster, roles & invites" },
      { key: "manage_settings", label: "Settings", description: "Name, logo, colors, domains" },
      { key: "manage_features", label: "Features", description: "Turn features on/off & configure" },
      { key: "manage_articles", label: "Articles", description: "Write, edit & publish articles" },
      { key: "manage_courses", label: "Courses", description: "Verify & delete courses" },
      { key: "send_announcements", label: "Announcements", description: "Send member notifications" },
      { key: "manage_gallery", label: "Photos", description: "Moderate the gallery" },
      { key: "manage_music", label: "Music", description: "Manage the jukebox library" },
    ],
  },
];

export const PERMISSION_KEYS: string[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export type MemberRole = "owner" | "admin" | "member";

export type PermissionMap = Record<string, boolean>;

/** Keep only known keys with a `true` value (sanitize incoming grants). */
export function cleanPermissions(input: unknown): PermissionMap {
  const out: PermissionMap = {};
  if (input && typeof input === "object") {
    for (const key of PERMISSION_KEYS) {
      if ((input as Record<string, unknown>)[key] === true) out[key] = true;
    }
  }
  return out;
}

/**
 * A group owner/admin implicitly has every permission; a member has only the
 * keys explicitly granted to them.
 */
export function memberHasPermission(
  role: MemberRole | string | null | undefined,
  permissions: PermissionMap | null | undefined,
  key: string,
): boolean {
  if (role === "owner" || role === "admin") return true;
  return !!permissions?.[key];
}
