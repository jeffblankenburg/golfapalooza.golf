// Issue #133. This admin path now re-exports the public Loozer-editable
// endpoint. Auth gating lives in `src/lib/courses/edit-access.ts` (locked
// courses → admin-only). Keeping this file as a thin alias avoids breaking
// any in-flight admin sessions while a single implementation handles both.
export { PUT } from "@/app/api/courses/holes/route";
