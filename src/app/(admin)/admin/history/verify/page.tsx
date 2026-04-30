import { HistoryVerifier } from "@/components/admin/HistoryVerifier";

export default function AdminHistoryVerifyPage() {
  return (
    <div className="px-4 py-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Verify import</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cross-checks imported accolades against the workbook&apos;s Summary sheet. Mismatches usually point to unmatched winners or workbook quirks.
        </p>
      </div>
      <HistoryVerifier />
    </div>
  );
}
