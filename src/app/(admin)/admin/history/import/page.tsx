import { HistoryAccoladeImporter } from "@/components/admin/HistoryAccoladeImporter";

export default function AdminHistoryImportPage() {
  return (
    <div className="px-4 py-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Import accolades</h1>
        <p className="text-sm text-gray-500 mt-1">
          Writes parsed awards into the accolades table. Idempotent — safe to re-run as you finish matching more Loozers.
        </p>
      </div>
      <HistoryAccoladeImporter />
    </div>
  );
}
