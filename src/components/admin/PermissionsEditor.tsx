"use client";

import { GLOBAL_PERMISSIONS, EVENT_PERMISSIONS } from "@/lib/permissions";
import type { PermissionDef } from "@/lib/permissions";

interface PermissionsEditorProps {
  permissions: Record<string, boolean>;
  onChange: (permissions: Record<string, boolean>) => void;
}

function PermissionCheckbox({
  perm,
  checked,
  onToggle,
}: {
  perm: PermissionDef;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-3 w-full text-left py-2 px-1 rounded-lg active:bg-gray-50"
    >
      <div
        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          checked ? "bg-green-600 border-green-600" : "border-gray-300"
        }`}
      >
        {checked && (
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
  );
}

function PermissionGroup({
  title,
  permDefs,
  permissions,
  onToggle,
  onToggleAll,
}: {
  title: string;
  permDefs: PermissionDef[];
  permissions: Record<string, boolean>;
  onToggle: (key: string) => void;
  onToggleAll: (keys: string[], selectAll: boolean) => void;
}) {
  const allChecked = permDefs.every((p) => permissions[p.key]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {title}
        </h3>
        <button
          type="button"
          onClick={() =>
            onToggleAll(
              permDefs.map((p) => p.key),
              !allChecked
            )
          }
          className="text-xs text-green-700 font-medium"
        >
          {allChecked ? "Deselect All" : "Select All"}
        </button>
      </div>
      <div className="space-y-0.5">
        {permDefs.map((perm) => (
          <PermissionCheckbox
            key={perm.key}
            perm={perm}
            checked={!!permissions[perm.key]}
            onToggle={() => onToggle(perm.key)}
          />
        ))}
      </div>
    </div>
  );
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

  const toggleAll = (keys: string[], selectAll: boolean) => {
    const next = { ...permissions };
    for (const key of keys) {
      if (selectAll) {
        next[key] = true;
      } else {
        delete next[key];
      }
    }
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">
        Admin Permissions
      </h3>
      <PermissionGroup
        title="Global"
        permDefs={GLOBAL_PERMISSIONS}
        permissions={permissions}
        onToggle={togglePermission}
        onToggleAll={toggleAll}
      />
      <PermissionGroup
        title="Event"
        permDefs={EVENT_PERMISSIONS}
        permissions={permissions}
        onToggle={togglePermission}
        onToggleAll={toggleAll}
      />
    </div>
  );
}
