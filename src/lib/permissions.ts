export interface PermissionDef {
  key: string;
  label: string;
  description: string;
}

export const PERMISSIONS: PermissionDef[] = [
  { key: "manage_events", label: "Events", description: "Event settings, create & archive" },
  { key: "manage_loozers", label: "Loozers", description: "Add, edit & remove players" },
  { key: "manage_roster", label: "Roster & Tee Times", description: "Roster, scramble teams, tee times" },
  { key: "manage_schedule", label: "Schedule", description: "Itinerary & action items" },
  { key: "manage_facilities", label: "Facilities & Courses", description: "Facilities, rooms, courses" },
  { key: "manage_contests", label: "Contests & Accolades", description: "Contests, accolades" },
  { key: "manage_finances", label: "Finances", description: "Financial data & budgets" },
  { key: "send_announcements", label: "Announcements", description: "Send push notifications" },
  { key: "manage_music", label: "Music", description: "Manage songs & audio files" },
];

export function hasPermission(
  permissions: Record<string, boolean> | null,
  isAdmin: boolean,
  key: string
): boolean {
  if (isAdmin) return true;
  return permissions?.[key] === true;
}

export function hasAnyPermission(
  permissions: Record<string, boolean> | null
): boolean {
  if (!permissions) return false;
  return Object.values(permissions).some((v) => v === true);
}
