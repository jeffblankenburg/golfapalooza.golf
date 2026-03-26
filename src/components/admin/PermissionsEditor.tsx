"use client";

import { PERMISSION_CATEGORIES } from "@/lib/permissions";

interface PermissionsEditorProps {
  permissions: Record<string, boolean>;
  onChange: (permissions: Record<string, boolean>) => void;
}

export function PermissionsEditor({
  permissions,
  onChange,
}: PermissionsEditorProps) {
  const togglePermission = (key: string) => {
    const next = { ...permissions };
    if (next[key]) {
      delete next[key];
    } else {
      next[key] = true;
    }
    onChange(next);
  };

  const toggleCategory = (categoryKey: string) => {
    const category = PERMISSION_CATEGORIES.find((c) => c.key === categoryKey);
    if (!category) return;

    const allChecked = category.permissions.every((p) => permissions[p.key]);
    const next = { ...permissions };

    for (const perm of category.permissions) {
      if (allChecked) {
        delete next[perm.key];
      } else {
        next[perm.key] = true;
      }
    }

    onChange(next);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        Permissions
      </h3>
      {PERMISSION_CATEGORIES.map((category) => {
        const allChecked = category.permissions.every(
          (p) => permissions[p.key]
        );
        const someChecked =
          !allChecked && category.permissions.some((p) => permissions[p.key]);

        return (
          <div key={category.key}>
            {/* Category header */}
            <button
              type="button"
              onClick={() => toggleCategory(category.key)}
              className="flex items-center gap-2.5 w-full text-left py-1"
            >
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  allChecked
                    ? "bg-green-600 border-green-600"
                    : someChecked
                      ? "bg-green-200 border-green-400"
                      : "border-gray-300"
                }`}
              >
                {(allChecked || someChecked) && (
                  <svg
                    className={`w-3 h-3 ${allChecked ? "text-white" : "text-green-700"}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d={allChecked ? "M5 13l4 4L19 7" : "M5 12h14"}
                    />
                  </svg>
                )}
              </div>
              <span className="text-sm font-semibold text-gray-900">
                {category.label}
              </span>
            </button>

            {/* Sub-permissions */}
            <div className="ml-7 mt-1 space-y-0.5">
              {category.permissions.map((perm) => (
                <button
                  type="button"
                  key={perm.key}
                  onClick={() => togglePermission(perm.key)}
                  className="flex items-center gap-2.5 w-full text-left py-1"
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      permissions[perm.key]
                        ? "bg-green-600 border-green-600"
                        : "border-gray-300"
                    }`}
                  >
                    {permissions[perm.key] && (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-gray-700">{perm.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
