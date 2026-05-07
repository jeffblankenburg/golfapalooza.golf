import { AttendanceGrid } from "@/components/admin/AttendanceGrid";

export default function AdminAttendancePage() {
  return (
    <div className="px-4 py-4">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
        <p className="text-sm text-gray-500 mt-1">
          One row per Loozer, one column per event. Click any cell to toggle attendance — the count surfaces on profile pages, the family tree, and the Loozers grid.
        </p>
      </div>
      <AttendanceGrid />
    </div>
  );
}
