import { HistoryUserMatcher } from "@/components/admin/HistoryUserMatcher";

export default function AdminHistoryUsersPage() {
  return (
    <div className="px-4 py-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Match Loozers</h1>
        <p className="text-sm text-gray-500 mt-1">
          Map each workbook name to a Loozer. Auto-suggested matches appear pre-selected — click ✓ to confirm.
        </p>
      </div>
      <HistoryUserMatcher />
    </div>
  );
}
