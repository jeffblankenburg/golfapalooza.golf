export interface PermissionDef {
  key: string;
  label: string;
  description: string;
}

// Global permissions (top-level admin pages)
export const GLOBAL_PERMISSIONS: PermissionDef[] = [
  { key: "manage_loozers", label: "Loozers", description: "Add, edit & remove players" },
  { key: "manage_facilities", label: "Facilities & Courses", description: "Facilities, rooms, courses" },
  { key: "send_announcements", label: "Announcements", description: "Send push notifications" },
  { key: "manage_music", label: "Music", description: "Manage songs & audio files" },
  { key: "manage_finances", label: "Finances", description: "Financial data & budgets" },
];

// Event permissions (per-accordion on the event page)
export const EVENT_PERMISSIONS: PermissionDef[] = [
  { key: "manage_visibility", label: "Visibility", description: "Control what Loozers see" },
  { key: "manage_event_settings", label: "Settings", description: "Event settings & days" },
  { key: "manage_courses", label: "Courses", description: "Event course picker" },
  { key: "manage_event_facilities", label: "Facilities & Rooms", description: "Facility linking & rooms" },
  { key: "manage_roster", label: "Roster", description: "Event roster" },
  { key: "manage_contests", label: "Contests", description: "Contest setup" },
  { key: "manage_kgb_cup", label: "KGB Cup", description: "Teams, handicaps & scoring" },
  { key: "manage_scrambles", label: "Scrambles", description: "Teams, scoring, 100 Feet & daily winners" },
  { key: "manage_cornhole", label: "Cornhole", description: "Teams & brackets" },
  { key: "manage_calcutta", label: "Calcutta", description: "Auction order, prizes & bids" },
  { key: "manage_tee_times", label: "Tee Times", description: "Tee time assignments" },
  { key: "manage_schedule", label: "Schedule", description: "Itinerary & action items" },
  { key: "manage_accolades", label: "Accolades", description: "Awards & history" },
  { key: "manage_pickem", label: "Pick'em", description: "Football pick'em games & results" },
  { key: "manage_notebook", label: "Notebook", description: "Notes & rules for players" },
  { key: "manage_options", label: "Trip Options", description: "Option builder & selections" },
];

// Combined list for backwards compatibility
export const PERMISSIONS: PermissionDef[] = [
  ...GLOBAL_PERMISSIONS,
  ...EVENT_PERMISSIONS,
];

const EVENT_PERMISSION_KEYS = new Set(EVENT_PERMISSIONS.map((p) => p.key));

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

export function hasAnyEventPermission(
  permissions: Record<string, boolean> | null
): boolean {
  if (!permissions) return false;
  return Object.entries(permissions).some(
    ([key, val]) => val === true && EVENT_PERMISSION_KEYS.has(key)
  );
}
