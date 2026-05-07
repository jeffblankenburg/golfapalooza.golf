import { HistoryAttendanceImporter } from "@/components/admin/HistoryAttendanceImporter";

export default function AdminHistoryImportAttendancePage() {
  return (
    <div className="px-4 py-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Import attendance</h1>
        <p className="text-sm text-gray-500 mt-1">
          Writes per-Loozer trip attendance from the Attendance sheet of the workbook. Idempotent on (user, trip) — safe to re-run as you finish matching more Loozers.
        </p>
      </div>
      <HistoryAttendanceImporter />
    </div>
  );
}
