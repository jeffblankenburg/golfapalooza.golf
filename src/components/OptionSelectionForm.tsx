"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { OptionIcon } from "@/lib/option-icons";
import { logActivity } from "@/components/ActivityTracker";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

interface OptionChoice {
  label: string;
  value: string;
  cost?: number;
}

interface Option {
  id: string;
  group_id: string;
  name: string;
  description?: string;
  icon?: string | null;
  option_type: "checkbox" | "select" | "multi_select" | "text" | "number";
  cost?: number;
  choices?: OptionChoice[];
  is_required: boolean;
  sort_order: number;
  depends_on_option_id?: string | null;
}

interface OptionGroup {
  id: string;
  trip_id: string;
  name: string;
  description?: string;
  icon?: string | null;
  sort_order: number;
}

interface OptionSettings {
  selection_deadline: string | null;
  is_open: boolean;
}

type SelectionValue = boolean | string | string[] | number | null;

interface OptionSelectionFormProps {
  tripId: string;
}

export default function OptionSelectionForm({ tripId }: OptionSelectionFormProps) {
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [settings, setSettings] = useState<OptionSettings>({ selection_deadline: null, is_open: true });
  const [selections, setSelections] = useState<Record<string, SelectionValue>>({});
  const [loading, setLoading] = useState(true);
  const [savingOptions, setSavingOptions] = useState<Record<string, "saving" | "saved" | "error">>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const isLocked = useCallback(() => {
    if (!settings.is_open) return true;
    if (settings.selection_deadline && new Date() > new Date(settings.selection_deadline)) return true;
    return false;
  }, [settings]);

  // Fetch options and selections
  useEffect(() => {
    async function load() {
      try {
        const [optionsRes, selectionsRes] = await Promise.all([
          fetch(`/api/options?trip_id=${tripId}`),
          fetch(`/api/selections?trip_id=${tripId}`),
        ]);

        if (optionsRes.ok) {
          const optionsData = await optionsRes.json();
          setGroups(optionsData.groups || []);
          setOptions(optionsData.options || []);
          setSettings(optionsData.settings || { selection_deadline: null, is_open: true });
        }

        if (selectionsRes.ok) {
          const selectionsData = await selectionsRes.json();
          const selMap: Record<string, SelectionValue> = {};
          for (const [optionId, sel] of Object.entries(selectionsData.selections || {})) {
            selMap[optionId] = (sel as { value: SelectionValue }).value;
          }
          setSelections(selMap);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tripId]);

  const saveSelection = useCallback(async (optionId: string, value: SelectionValue) => {
    setSavingOptions((prev) => ({ ...prev, [optionId]: "saving" }));
    try {
      const res = await fetch("/api/selections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          option_id: optionId,
          value: value === false ? null : value,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Save failed");
      }

      logActivity("option_selection", "/options", { option_id: optionId });
      setSavingOptions((prev) => ({ ...prev, [optionId]: "saved" }));
      setTimeout(() => {
        setSavingOptions((prev) => {
          const next = { ...prev };
          if (next[optionId] === "saved") delete next[optionId];
          return next;
        });
      }, 1500);
    } catch {
      setSavingOptions((prev) => ({ ...prev, [optionId]: "error" }));
      // Revert optimistic update by refetching
      const selectionsRes = await fetch(`/api/selections?trip_id=${tripId}`);
      if (selectionsRes.ok) {
        const selectionsData = await selectionsRes.json();
        const selMap: Record<string, SelectionValue> = {};
        for (const [oid, sel] of Object.entries(selectionsData.selections || {})) {
          selMap[oid] = (sel as { value: SelectionValue }).value;
        }
        setSelections(selMap);
      }
      setTimeout(() => {
        setSavingOptions((prev) => {
          const next = { ...prev };
          if (next[optionId] === "error") delete next[optionId];
          return next;
        });
      }, 3000);
    }
  }, [tripId]);

  // Check if a dependency is satisfied (parent option is selected)
  const isDependencySatisfied = useCallback((option: Option): boolean => {
    if (!option.depends_on_option_id) return true;
    const parentVal = selections[option.depends_on_option_id];
    if (parentVal === null || parentVal === undefined || parentVal === false) return false;
    if (Array.isArray(parentVal) && parentVal.length === 0) return false;
    return true;
  }, [selections]);

  // Get the name of the parent option for hint text
  const getDependencyName = useCallback((option: Option): string | null => {
    if (!option.depends_on_option_id) return null;
    const parent = options.find((o) => o.id === option.depends_on_option_id);
    return parent?.name || null;
  }, [options]);

  const handleChange = useCallback((optionId: string, value: SelectionValue, debounce = false) => {
    if (isLocked()) return;

    setSelections((prev) => ({ ...prev, [optionId]: value }));

    // If deselecting, cascade-clear any dependent options
    const isDeselecting = value === null || value === false || value === undefined || (Array.isArray(value) && value.length === 0);
    if (isDeselecting) {
      const dependents = options.filter((o) => o.depends_on_option_id === optionId);
      for (const dep of dependents) {
        const depVal = selections[dep.id];
        if (depVal !== null && depVal !== undefined && depVal !== false) {
          setSelections((prev) => ({ ...prev, [dep.id]: null }));
          saveSelection(dep.id, null);
        }
      }
    }

    if (debounce) {
      if (debounceTimers.current[optionId]) {
        clearTimeout(debounceTimers.current[optionId]);
      }
      debounceTimers.current[optionId] = setTimeout(() => {
        saveSelection(optionId, value);
      }, 300);
    } else {
      saveSelection(optionId, value);
    }
  }, [isLocked, saveSelection, options, selections]);

  // Cost calculation
  const calculateCost = useCallback(() => {
    let total = 0;
    for (const opt of options) {
      const val = selections[opt.id];
      if (val === null || val === undefined) continue;

      if (opt.option_type === "checkbox" && val === true) {
        total += opt.cost ? Number(opt.cost) : 0;
      } else if (opt.option_type === "select" && typeof val === "string") {
        const matched = (opt.choices || []).find((c) => c.value === val);
        if (matched?.cost) total += Number(matched.cost);
      } else if (opt.option_type === "multi_select" && Array.isArray(val)) {
        for (const v of val) {
          const matched = (opt.choices || []).find((c) => c.value === v);
          if (matched?.cost) total += Number(matched.cost);
        }
      }
    }
    return total;
  }, [options, selections]);

  // Deadline helpers
  const deadlineDate = settings.selection_deadline ? new Date(settings.selection_deadline) : null;
  const now = new Date();
  const daysUntilDeadline = deadlineDate
    ? Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const formatDeadline = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  const locked = isLocked();
  const totalCost = calculateCost();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-lg font-medium text-gray-600">No options available for this trip yet.</p>
      </div>
    );
  }

  // Group options by group_id, plus ungrouped
  const optionsByGroup: Record<string, Option[]> = {};
  for (const opt of options) {
    const gid = opt.group_id || "__ungrouped";
    if (!optionsByGroup[gid]) optionsByGroup[gid] = [];
    optionsByGroup[gid].push(opt);
  }

  return (
    <div className="space-y-4">
      {/* Deadline banner */}
      {locked && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m9.364-7.364l-1.414 1.414M21 12h-2m0 0h-2m2 0v2m0-2V10M3.636 4.636l1.414 1.414M3 12h2m0 0h2m-2 0v2m0-2V10m9-6V2m0 2v2m0-2H10m2 0h2" />
            <rect x="5" y="11" width="14" height="10" rx="2" strokeWidth={2} />
            <path strokeLinecap="round" strokeWidth={2} d="M12 11V8" />
          </svg>
          <div>
            <p className="font-semibold text-amber-800">Selections are closed</p>
            <p className="text-sm text-amber-700 mt-0.5">Contact an admin to make changes.</p>
          </div>
        </div>
      )}

      {!locked && deadlineDate && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Selections due by {formatDeadline(settings.selection_deadline!)}</span>
            {daysUntilDeadline !== null && daysUntilDeadline > 0 && daysUntilDeadline <= 7 && (
              <span className="ml-2 text-blue-600 font-semibold">
                ({daysUntilDeadline} {daysUntilDeadline === 1 ? "day" : "days"} left)
              </span>
            )}
          </p>
        </div>
      )}

      {/* Running cost total */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-500">Your estimated cost</span>
          <span className="text-2xl font-bold text-gray-900">
            ${totalCost.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Option groups */}
      {groups.map((group) => {
        const groupOptions = optionsByGroup[group.id];
        if (!groupOptions || groupOptions.length === 0) return null;

        return (
          <div key={group.id} className="space-y-3">
            <div>
              <div className="flex items-center gap-2">
                {group.icon && (
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <OptionIcon iconKey={group.icon} className="w-5 h-5" />
                  </div>
                )}
                <h3 className="text-lg font-bold text-gray-900">{group.name}</h3>
              </div>
              {group.description && (
                <div className="text-sm text-gray-500 mt-1 mb-3 prose prose-sm prose-gray max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkBreaks]}>{group.description}</ReactMarkdown>
                </div>
              )}
            </div>

            {groupOptions.map((opt) => (
              <OptionField
                key={opt.id}
                option={opt}
                value={selections[opt.id] ?? null}
                onChange={handleChange}
                saveStatus={savingOptions[opt.id]}
                disabled={locked || !isDependencySatisfied(opt)}
                dependencyName={!isDependencySatisfied(opt) ? getDependencyName(opt) : null}
              />
            ))}
          </div>
        );
      })}

      {/* Ungrouped options */}
      {optionsByGroup["__ungrouped"] && optionsByGroup["__ungrouped"].length > 0 && (
        <div className="space-y-3">
          {optionsByGroup["__ungrouped"].map((opt) => (
            <OptionField
              key={opt.id}
              option={opt}
              value={selections[opt.id] ?? null}
              onChange={handleChange}
              saveStatus={savingOptions[opt.id]}
              disabled={locked || !isDependencySatisfied(opt)}
              dependencyName={!isDependencySatisfied(opt) ? getDependencyName(opt) : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual option field component
// ---------------------------------------------------------------------------

function OptionField({
  option,
  value,
  onChange,
  saveStatus,
  disabled,
  dependencyName,
}: {
  option: Option;
  value: SelectionValue;
  onChange: (optionId: string, value: SelectionValue, debounce?: boolean) => void;
  saveStatus?: "saving" | "saved" | "error";
  disabled: boolean;
  dependencyName?: string | null;
}) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 transition-opacity ${dependencyName ? "border-gray-100 opacity-50" : "border-gray-200"}`}>
      {/* Save indicator */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {option.icon && (
            <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0">
              <OptionIcon iconKey={option.icon} className="w-5 h-5" />
            </div>
          )}
          <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-900">{option.name}</span>
            {option.is_required && <span className="text-red-500 text-sm">*</span>}
            {option.option_type === "checkbox" && option.cost ? (
              <span className="text-green-700 font-semibold text-sm ml-1">
                ${Number(option.cost).toLocaleString()}
              </span>
            ) : null}
          </div>
          {dependencyName && (
            <p className="text-xs text-gray-400 mt-0.5">Requires {dependencyName}</p>
          )}
          {option.description && !dependencyName && (
            <div className="text-sm text-gray-500 mt-0.5 prose prose-sm prose-gray max-w-none">
              <ReactMarkdown remarkPlugins={[remarkBreaks]}>{option.description}</ReactMarkdown>
            </div>
          )}
          </div>
        </div>
        <SaveIndicator status={saveStatus} />
      </div>

      {/* Input based on type */}
      {option.option_type === "checkbox" && (
        <CheckboxInput option={option} value={value} onChange={onChange} disabled={disabled} />
      )}
      {option.option_type === "select" && (
        <SelectInput option={option} value={value} onChange={onChange} disabled={disabled} />
      )}
      {option.option_type === "multi_select" && (
        <MultiSelectInput option={option} value={value} onChange={onChange} disabled={disabled} />
      )}
      {option.option_type === "text" && (
        <TextInput option={option} value={value} onChange={onChange} disabled={disabled} />
      )}
      {option.option_type === "number" && (
        <NumberInput option={option} value={value} onChange={onChange} disabled={disabled} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save indicator
// ---------------------------------------------------------------------------

function SaveIndicator({ status }: { status?: "saving" | "saved" | "error" }) {
  return (
    <span className="w-14 flex items-center justify-end gap-1 text-xs shrink-0">
      {status === "saving" && (
        <>
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-gray-400">Saving</span>
        </>
      )}
      {status === "saved" && (
        <>
          <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-green-600">Saved</span>
        </>
      )}
      {status === "error" && (
        <>
          <svg className="w-3.5 h-3.5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-red-600">Error</span>
        </>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Checkbox input
// ---------------------------------------------------------------------------

function CheckboxInput({
  option,
  value,
  onChange,
  disabled,
}: {
  option: Option;
  value: SelectionValue;
  onChange: (optionId: string, value: SelectionValue, debounce?: boolean) => void;
  disabled: boolean;
}) {
  const checked = value === true;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(option.id, !checked)}
      className={`mt-2 w-full flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors ${
        disabled
          ? "bg-gray-50 cursor-not-allowed"
          : checked
          ? "bg-green-50 border border-green-200"
          : "bg-gray-50 hover:bg-gray-100 border border-transparent"
      }`}
    >
      <span className="text-sm text-gray-700">{checked ? "Selected" : "Tap to select"}</span>
      <div
        className={`w-10 h-6 rounded-full transition-colors relative ${
          checked ? "bg-green-600" : "bg-gray-300"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Select (radio) input
// ---------------------------------------------------------------------------

function SelectInput({
  option,
  value,
  onChange,
  disabled,
}: {
  option: Option;
  value: SelectionValue;
  onChange: (optionId: string, value: SelectionValue, debounce?: boolean) => void;
  disabled: boolean;
}) {
  const choices = option.choices || [];
  const selected = typeof value === "string" ? value : null;

  return (
    <div className="mt-2 space-y-2">
      {choices.map((choice) => {
        const isSelected = selected === choice.value;
        return (
          <button
            key={choice.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.id, isSelected ? null : choice.value)}
            className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors text-left ${
              disabled
                ? "bg-gray-50 cursor-not-allowed"
                : isSelected
                ? "bg-green-50 border border-green-200"
                : "bg-gray-50 hover:bg-gray-100 border border-transparent"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  isSelected
                    ? "border-green-600 bg-green-600"
                    : "border-gray-300"
                } ${disabled ? "opacity-50" : ""}`}
              >
                {isSelected && (
                  <div className="w-2 h-2 bg-white rounded-full" />
                )}
              </div>
              <span className="text-sm text-gray-800">{choice.label}</span>
            </div>
            {choice.cost ? (
              <span className="text-green-700 font-semibold text-sm">
                ${Number(choice.cost).toLocaleString()}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-select (checkbox) input
// ---------------------------------------------------------------------------

function MultiSelectInput({
  option,
  value,
  onChange,
  disabled,
}: {
  option: Option;
  value: SelectionValue;
  onChange: (optionId: string, value: SelectionValue, debounce?: boolean) => void;
  disabled: boolean;
}) {
  const choices = option.choices || [];
  const selectedValues: string[] = Array.isArray(value) ? value : [];

  const toggle = (choiceValue: string) => {
    const next = selectedValues.includes(choiceValue)
      ? selectedValues.filter((v) => v !== choiceValue)
      : [...selectedValues, choiceValue];
    onChange(option.id, next.length > 0 ? next : null);
  };

  return (
    <div className="mt-2 space-y-2">
      {choices.map((choice) => {
        const isSelected = selectedValues.includes(choice.value);
        return (
          <button
            key={choice.value}
            type="button"
            disabled={disabled}
            onClick={() => toggle(choice.value)}
            className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors text-left ${
              disabled
                ? "bg-gray-50 cursor-not-allowed"
                : isSelected
                ? "bg-green-50 border border-green-200"
                : "bg-gray-50 hover:bg-gray-100 border border-transparent"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                  isSelected
                    ? "border-green-600 bg-green-600"
                    : "border-gray-300"
                } ${disabled ? "opacity-50" : ""}`}
              >
                {isSelected && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="text-sm text-gray-800">{choice.label}</span>
            </div>
            {choice.cost ? (
              <span className="text-green-700 font-semibold text-sm">
                ${Number(choice.cost).toLocaleString()}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text input
// ---------------------------------------------------------------------------

function TextInput({
  option,
  value,
  onChange,
  disabled,
}: {
  option: Option;
  value: SelectionValue;
  onChange: (optionId: string, value: SelectionValue, debounce?: boolean) => void;
  disabled: boolean;
}) {
  const textValue = typeof value === "string" ? value : "";
  return (
    <input
      type="text"
      value={textValue}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value || null;
        onChange(option.id, v, true);
      }}
      placeholder="Type your answer..."
      className={`mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
        disabled ? "bg-gray-50 cursor-not-allowed opacity-60" : "bg-gray-50"
      }`}
    />
  );
}

// ---------------------------------------------------------------------------
// Number input
// ---------------------------------------------------------------------------

function NumberInput({
  option,
  value,
  onChange,
  disabled,
}: {
  option: Option;
  value: SelectionValue;
  onChange: (optionId: string, value: SelectionValue, debounce?: boolean) => void;
  disabled: boolean;
}) {
  const numValue = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  return (
    <input
      type="number"
      value={numValue}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        const v = raw === "" ? null : Number(raw);
        onChange(option.id, v, true);
      }}
      placeholder="Enter a number..."
      className={`mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
        disabled ? "bg-gray-50 cursor-not-allowed opacity-60" : "bg-gray-50"
      }`}
    />
  );
}
