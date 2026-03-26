export interface PermissionDef {
  key: string;
  label: string;
}

export interface PermissionCategory {
  key: string;
  label: string;
  permissions: PermissionDef[];
}

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    key: "event",
    label: "Event Setup & Management",
    permissions: [
      { key: "event_setup", label: "Event Setup & Management" },
    ],
  },
  {
    key: "golfer",
    label: "Golfer Management",
    permissions: [
      { key: "golfer_invitations", label: "Invitations" },
      { key: "golfer_access_rights", label: "Access Rights" },
      { key: "golfer_registrants", label: "Registrants & Participants & Addresses" },
    ],
  },
  {
    key: "comm",
    label: "Communication Management",
    permissions: [
      { key: "comm_email_text", label: "Email/Text" },
      { key: "comm_news_articles", label: "News Articles" },
      { key: "comm_notebook", label: "Notebook" },
      { key: "comm_photo_approval", label: "Photo Approval" },
      { key: "comm_lodging", label: "Lodging" },
      { key: "comm_itinerary", label: "Itinerary & Activity Log" },
      { key: "comm_pairings", label: "Pairings" },
      { key: "comm_awards", label: "Awards" },
    ],
  },
  {
    key: "comp",
    label: "Competition Setup & Management",
    permissions: [
      { key: "comp_handicapping", label: "Handicapping" },
      { key: "comp_rounds", label: "Rounds" },
      { key: "comp_teams", label: "Teams" },
      { key: "comp_hole_distribution", label: "Hole Distribution" },
      { key: "comp_all_scores", label: "All Scores" },
      { key: "comp_own_scores", label: "Own Scores" },
    ],
  },
  {
    key: "finance",
    label: "Finance & Option Management",
    permissions: [
      { key: "finance_finances", label: "Finances" },
      { key: "finance_options", label: "Options" },
    ],
  },
];

export function hasPermission(
  permissions: Record<string, boolean> | null,
  isAdmin: boolean,
  key: string
): boolean {
  if (isAdmin) return true;
  return permissions?.[key] === true;
}
