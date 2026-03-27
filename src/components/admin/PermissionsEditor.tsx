"use client";

import { PERMISSIONS } from "@/lib/permissions";

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

  const allChecked = PERMISSIONS.every((p) => permissions[p.key]);

  const toggleAll = () => {
    if (allChecked) {
      onChange({});
    } else {
      const next: Record<string, boolean> = {};
      for (const p of PERMISSIONS) next[p.key] = true;
      onChange(next);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Admin Permissions
        </h3>
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs text-green-700 font-medium"
        >
          {allChecked ? "Deselect All" : "Select All"}
        </button>
      </div>
      <div className="space-y-0.5">
        {PERMISSIONS.map((perm) => (
          <button
            type="button"
            key={perm.key}
            onClick={() => togglePermission(perm.key)}
            className="flex items-center gap-3 w-full text-left py-2 px-1 rounded-lg active:bg-gray-50"
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
            <div className="min-w-0">
              <span className="text-sm font-medium text-gray-900">{perm.label}</span>
              <span className="text-xs text-gray-500 ml-1.5">{perm.description}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
