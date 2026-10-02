/** Shared cost-item constants (#213). The universal money catalog. */
export const COST_ITEM_SELECT =
  "id, org_id, event_id, name, amount_cents, category, included_in_trip_cost, linked_option_id, source_type, source_id, sort_order, notes, created_at, updated_at";

/** Categories a manual cost item can be filed under (auto items set their own). */
export const COST_CATEGORIES = ["lodging", "food", "shirts", "operational", "pass_through", "other"] as const;

/** Display labels for both manual categories and the auto source types. */
export const COST_CATEGORY_LABEL: Record<string, string> = {
  contest: "Contests", side_game: "Side games", lodging: "Lodging", food: "Food",
  shirts: "Shirts", operational: "Operational", pass_through: "Pass-through", other: "Other",
};
