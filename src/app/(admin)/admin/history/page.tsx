import Link from "next/link";

const sections = [
  {
    href: "/admin/history/users",
    label: "Match Loozers",
    description: "Map every workbook name to a user row",
  },
  {
    href: "/admin/history/import",
    label: "Import accolades",
    description: "Write parsed awards to the accolades table",
  },
  {
    href: "/admin/history/import-attendance",
    label: "Import attendance",
    description: "Write per-Loozer trip attendance from the Attendance sheet",
  },
  {
    href: "/admin/history/verify",
    label: "Verify",
    description: "Cross-check imports against the workbook Summary sheet",
  },
];

export default function AdminHistoryIndex() {
  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Historical import</h1>
        <p className="text-sm text-gray-500 mt-1">
          Phase 1a: workbook → accolades. See issue #114 for the full plan.
        </p>
      </div>
      <div className="space-y-2">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="block bg-white rounded-2xl border border-gray-200 shadow-sm p-4 active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">{s.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>
              </div>
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
