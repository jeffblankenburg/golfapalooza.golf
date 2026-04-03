"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { OPTION_ICONS, ICON_CATEGORIES, OptionIcon } from "@/lib/option-icons";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

interface OptionGroup {
  id: string;
  trip_id: string;
  name: string;
  description?: string;
  icon?: string | null;
  sort_order: number;
}

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
}

interface OptionSettings {
  selection_deadline: string | null;
  is_open: boolean;
}

const TYPE_OPTIONS = [
  { value: "checkbox", label: "Checkbox", icon: "CheckSquare" },
  { value: "select", label: "Select One", icon: "ChevronDown" },
  { value: "multi_select", label: "Multi-Select", icon: "ListChecks" },
  { value: "text", label: "Text", icon: "Type" },
  { value: "number", label: "Number", icon: "Hash" },
];

const TYPE_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  checkbox: {
    label: "Checkbox",
    color: "text-blue-600",
    bg: "bg-blue-50",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  select: {
    label: "Select",
    color: "text-purple-600",
    bg: "bg-purple-50",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
      </svg>
    ),
  },
  multi_select: {
    label: "Multi",
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  text: {
    label: "Text",
    color: "text-gray-600",
    bg: "bg-gray-100",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  },
  number: {
    label: "Number",
    color: "text-amber-600",
    bg: "bg-amber-50",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
      </svg>
    ),
  },
};

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function OptionBuilder({ tripId }: { tripId: string }) {
  const [settings, setSettings] = useState<OptionSettings>({
    selection_deadline: null,
    is_open: false,
  });
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Collapsed groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Group inline editing
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [editingGroupIcon, setEditingGroupIcon] = useState<string | null>(null);

  // New group form
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupIcon, setNewGroupIcon] = useState<string | null>(null);

  // Option form
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [showOptionFormForGroup, setShowOptionFormForGroup] = useState<string | null>(null);
  const [optionName, setOptionName] = useState("");
  const [optionDescription, setOptionDescription] = useState("");
  const [optionType, setOptionType] = useState<Option["option_type"]>("checkbox");
  const [optionCost, setOptionCost] = useState<number | "">("");
  const [optionChoices, setOptionChoices] = useState<OptionChoice[]>([]);
  const [optionIsRequired, setOptionIsRequired] = useState(false);
  const [optionIcon, setOptionIcon] = useState<string | null>(null);

  // Icon picker open state
  const [iconPickerOpen, setIconPickerOpen] = useState<string | null>(null); // "new-group" | "edit-group" | "option" | null

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // ── Data Fetching ──

  const fetchData = useCallback(async () => {
    const [settingsRes, groupsRes, optionsRes] = await Promise.all([
      fetch(`/api/admin/options/settings?trip_id=${tripId}`),
      fetch(`/api/admin/options/groups?trip_id=${tripId}`),
      fetch(`/api/admin/options?trip_id=${tripId}`),
    ]);
    const settingsData = await settingsRes.json();
    const groupsData = await groupsRes.json();
    const optionsData = await optionsRes.json();
    setSettings({
      selection_deadline: settingsData.settings?.selection_deadline?.split("T")[0] || null,
      is_open: settingsData.settings?.is_open ?? false,
    });
    setGroups(groupsData.groups || []);
    setOptions(optionsData.options || []);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Settings ──

  const saveSettings = async (updates: Partial<OptionSettings>) => {
    const updated = { ...settings, ...updates };
    setSettings(updated);
    setSaving("settings");
    await fetch("/api/admin/options/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trip_id: tripId,
        selection_deadline: updated.selection_deadline,
        is_open: updated.is_open,
      }),
    });
    setSaving(null);
  };

  // ── Group CRUD ──

  const toggleCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const startEditGroupName = (group: OptionGroup) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
    setEditingGroupIcon(group.icon || null);
    setIconPickerOpen(null);
  };

  const saveGroupName = async () => {
    if (!editingGroupId || !editingGroupName.trim()) return;
    setSaving("group");
    await fetch("/api/admin/options/groups", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingGroupId, name: editingGroupName.trim(), icon: editingGroupIcon }),
    });
    setEditingGroupId(null);
    setEditingGroupName("");
    setEditingGroupIcon(null);
    setIconPickerOpen(null);
    await fetchData();
    setSaving(null);
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    setSaving("group");
    await fetch("/api/admin/options/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: tripId, name: newGroupName.trim(), icon: newGroupIcon }),
    });
    setNewGroupName("");
    setNewGroupIcon(null);
    setShowNewGroupForm(false);
    setIconPickerOpen(null);
    await fetchData();
    setSaving(null);
  };

  const deleteGroup = (group: OptionGroup) => {
    const optionCount = options.filter((o) => o.group_id === group.id).length;
    setConfirmModal({
      title: "Delete Group",
      message:
        optionCount > 0
          ? `Delete "${group.name}" and its ${optionCount} option${optionCount === 1 ? "" : "s"}? This will also remove any associated charges.`
          : `Delete "${group.name}"?`,
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch("/api/admin/options/groups", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: group.id }),
        });
        await fetchData();
      },
    });
  };

  // ── Group Reorder ──

  const moveGroup = async (groupId: string, direction: "up" | "down") => {
    const idx = groups.findIndex((g) => g.id === groupId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= groups.length) return;

    // Optimistic reorder
    const reordered = [...groups];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    setGroups(reordered);

    // Persist both sort_order changes
    await Promise.all(
      reordered.map((g, i) =>
        fetch("/api/admin/options/groups", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: g.id, sort_order: i }),
        })
      )
    );
  };

  // ── Option CRUD ──

  const resetOptionForm = () => {
    setOptionName("");
    setOptionDescription("");
    setOptionType("checkbox");
    setOptionCost("");
    setOptionChoices([]);
    setOptionIsRequired(false);
    setOptionIcon(null);
    setEditingOptionId(null);
    setShowOptionFormForGroup(null);
    setIconPickerOpen(null);
  };

  const startNewOption = (groupId: string) => {
    resetOptionForm();
    setShowOptionFormForGroup(groupId);
  };

  const startEditOption = (option: Option) => {
    setEditingOptionId(option.id);
    setShowOptionFormForGroup(option.group_id);
    setOptionName(option.name);
    setOptionDescription(option.description || "");
    setOptionType(option.option_type);
    setOptionCost(option.cost ?? "");
    setOptionChoices(option.choices || []);
    setOptionIsRequired(option.is_required);
    setOptionIcon(option.icon || null);
    setIconPickerOpen(null);
  };

  const saveOption = async () => {
    if (!optionName.trim() || !showOptionFormForGroup) return;
    setSaving("option");

    const payload = {
      group_id: showOptionFormForGroup,
      name: optionName.trim(),
      description: optionDescription.trim() || null,
      icon: optionIcon,
      option_type: optionType,
      cost: optionType === "checkbox" && optionCost !== "" ? Number(optionCost) : null,
      choices:
        optionType === "select" || optionType === "multi_select"
          ? optionChoices
          : null,
      is_required: optionIsRequired,
    };

    if (editingOptionId) {
      await fetch("/api/admin/options", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingOptionId, ...payload }),
      });
    } else {
      await fetch("/api/admin/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: tripId, ...payload }),
      });
    }

    resetOptionForm();
    await fetchData();
    setSaving(null);
  };

  const deleteOption = (option: Option) => {
    setConfirmModal({
      title: "Delete Option",
      message: `Delete "${option.name}"? Any associated selections and charges will also be removed.`,
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch("/api/admin/options", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: option.id }),
        });
        await fetchData();
      },
    });
  };

  // ── Choices helpers ──

  const addChoice = () => {
    setOptionChoices([...optionChoices, { label: "", value: "", cost: 0 }]);
  };

  const updateChoice = (index: number, field: keyof OptionChoice, val: string | number) => {
    setOptionChoices((prev) =>
      prev.map((c, i): OptionChoice => {
        if (i !== index) return c;
        if (field === "label") {
          return { ...c, label: val as string, value: slugify(val as string) };
        }
        if (field === "cost") {
          return { ...c, cost: Number(val) };
        }
        return { ...c, [field]: String(val) };
      })
    );
  };

  const removeChoice = (index: number) => {
    setOptionChoices((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Helpers ──

  const getOptionCostSummary = (option: Option): string | null => {
    if (option.option_type === "checkbox" && option.cost) {
      return formatCurrency(option.cost);
    }
    if ((option.option_type === "select" || option.option_type === "multi_select") && option.choices) {
      const costs = option.choices.filter((c) => c.cost && c.cost > 0);
      if (costs.length === 0) return null;
      const unique = [...new Set(costs.map((c) => c.cost!))];
      if (unique.length === 1) return formatCurrency(unique[0]);
      return `${formatCurrency(Math.min(...unique))}–${formatCurrency(Math.max(...unique))}`;
    }
    return null;
  };

  const getOptionChoiceSummary = (option: Option): string | null => {
    if (!option.choices || option.choices.length === 0) return null;
    return `${option.choices.length} choice${option.choices.length !== 1 ? "s" : ""}`;
  };

  // ── Icon Picker ──

  const renderIconPicker = (
    pickerId: string,
    currentIcon: string | null,
    onSelect: (key: string | null) => void
  ) => {
    if (iconPickerOpen !== pickerId) return null;
    return (
      <div className="mt-2 p-3 bg-white border border-gray-200 rounded-xl shadow-sm space-y-2 max-h-64 overflow-y-auto">
        <button
          onClick={() => { onSelect(null); setIconPickerOpen(null); }}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            !currentIcon ? "bg-green-50 text-green-700 ring-1 ring-green-300" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          None
        </button>
        {ICON_CATEGORIES.map((cat) => {
          const catIcons = OPTION_ICONS.filter((i) => i.category === cat);
          return (
            <div key={cat}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{cat}</p>
              <div className="flex flex-wrap gap-1">
                {catIcons.map((icon) => (
                  <button
                    key={icon.key}
                    title={icon.label}
                    onClick={() => { onSelect(icon.key); setIconPickerOpen(null); }}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                      currentIcon === icon.key
                        ? "bg-green-50 text-green-700 ring-2 ring-green-400"
                        : "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    }`}
                  >
                    <OptionIcon iconKey={icon.key} className="w-5 h-5" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderIconPickerButton = (
    pickerId: string,
    currentIcon: string | null,
    label: string
  ) => (
    <button
      type="button"
      onClick={() => setIconPickerOpen(iconPickerOpen === pickerId ? null : pickerId)}
      className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
    >
      {currentIcon ? (
        <OptionIcon iconKey={currentIcon} className="w-4 h-4" />
      ) : (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )}
      {label}
    </button>
  );

  // ── Loading ──

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Option form renderer ──

  const renderOptionForm = (groupId: string) => {
    if (showOptionFormForGroup !== groupId) return null;

    return (
      <div className="mt-3 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span className="text-sm font-semibold text-gray-700">
            {editingOptionId ? "Edit Option" : "New Option"}
          </span>
        </div>

        <input
          autoFocus
          type="text"
          placeholder="Option name"
          value={optionName}
          onChange={(e) => setOptionName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
        />

        <div>
          {renderIconPickerButton("option", optionIcon, optionIcon ? "Change Icon" : "Add Icon")}
          {renderIconPicker("option", optionIcon, setOptionIcon)}
        </div>

        <div>
          <textarea
            placeholder="Description (optional) — supports **bold**, *italic*, and line breaks"
            value={optionDescription}
            onChange={(e) => setOptionDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-y"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select
              value={optionType}
              onChange={(e) => setOptionType(e.target.value as Option["option_type"])}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {optionType === "checkbox" && (
            <div className="w-32">
              <label className="block text-xs font-medium text-gray-500 mb-1">Cost ($)</label>
              <input
                type="number"
                placeholder="0"
                value={optionCost}
                onChange={(e) => setOptionCost(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
          )}
        </div>

        {(optionType === "select" || optionType === "multi_select") && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-500">Choices</label>
            {optionChoices.map((choice, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Label"
                  value={choice.label}
                  onChange={(e) => updateChoice(idx, "label", e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
                <div className="w-24 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={choice.cost ?? ""}
                    onChange={(e) => updateChoice(idx, "cost", e.target.value)}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <button
                  onClick={() => removeChoice(idx)}
                  className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              onClick={addChoice}
              className="flex items-center gap-1.5 text-sm text-green-600 font-medium hover:text-green-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Choice
            </button>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={optionIsRequired}
            onChange={(e) => setOptionIsRequired(e.target.checked)}
            className="rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          Required
        </label>

        <div className="flex gap-2 pt-1">
          <button
            onClick={saveOption}
            disabled={!optionName.trim() || saving === "option"}
            className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 active:opacity-80"
          >
            {saving === "option" ? "Saving..." : editingOptionId ? "Update Option" : "Add Option"}
          </button>
          <button
            onClick={resetOptionForm}
            className="px-4 py-2 border border-gray-300 text-sm font-semibold text-gray-600 rounded-xl active:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* ── Settings Bar ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-gray-900">Selection Settings</h3>
          {saving === "settings" && (
            <span className="text-xs text-gray-400 ml-auto">Saving...</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              <svg className="w-3.5 h-3.5 inline mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Deadline
            </label>
            <input
              type="date"
              value={settings.selection_deadline || ""}
              onChange={(e) => saveSettings({ selection_deadline: e.target.value || null })}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <button
              onClick={() => saveSettings({ is_open: !settings.is_open })}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                settings.is_open
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-gray-50 border-gray-200 text-gray-500"
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${settings.is_open ? "bg-green-500" : "bg-gray-400"}`} />
              {settings.is_open ? "Open" : "Closed"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Option Groups ── */}
      {groups.map((group, groupIndex) => {
        const groupOptions = options.filter((o) => o.group_id === group.id);
        const isCollapsed = collapsedGroups.has(group.id);
        const groupCostOptions = groupOptions.filter((o) => {
          if (o.option_type === "checkbox" && o.cost) return true;
          if ((o.option_type === "select" || o.option_type === "multi_select") && o.choices?.some((c) => c.cost && c.cost > 0)) return true;
          return false;
        });

        return (
          <div
            key={group.id}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
          >
            {/* Group header */}
            <div
              className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-gray-50 transition-colors"
              onClick={() => toggleCollapse(group.id)}
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                {group.icon ? (
                  <OptionIcon iconKey={group.icon} className="w-4 h-4" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                )}
              </div>

              {editingGroupId === group.id ? (
                <div className="flex-1" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={editingGroupName}
                      onChange={(e) => setEditingGroupName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveGroupName();
                        if (e.key === "Escape") {
                          setEditingGroupId(null);
                          setEditingGroupName("");
                          setEditingGroupIcon(null);
                          setIconPickerOpen(null);
                        }
                      }}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                    {renderIconPickerButton("edit-group", editingGroupIcon, "Icon")}
                    <button
                      onClick={saveGroupName}
                      disabled={saving === "group"}
                      className="text-xs text-green-600 font-semibold hover:underline"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingGroupId(null); setEditingGroupName(""); setEditingGroupIcon(null); setIconPickerOpen(null); }}
                      className="text-xs text-gray-400 hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                  {renderIconPicker("edit-group", editingGroupIcon, setEditingGroupIcon)}
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{group.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); startEditGroupName(group); }}
                      className="p-0.5 text-gray-300 hover:text-gray-500 rounded"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">
                      {groupOptions.length} option{groupOptions.length !== 1 ? "s" : ""}
                    </span>
                    {groupCostOptions.length > 0 && (
                      <span className="text-xs text-gray-400">
                        &middot; {groupCostOptions.length} with cost
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Reorder buttons */}
              <div className="flex flex-col flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => moveGroup(group.id, "up")}
                  disabled={groupIndex === 0}
                  className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-default transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => moveGroup(group.id, "down")}
                  disabled={groupIndex === groups.length - 1}
                  className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-default transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); deleteGroup(group); }}
                className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>

              <svg
                className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Group body */}
            {!isCollapsed && (
              <div className="border-t border-gray-100">
                {groupOptions.length === 0 && showOptionFormForGroup !== group.id && (
                  <button
                    onClick={() => startNewOption(group.id)}
                    className="w-full px-4 py-6 text-center hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-green-50 mx-auto mb-2 flex items-center justify-center text-green-500">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-400">Add first option</p>
                  </button>
                )}

                {groupOptions.map((option) => {
                  if (editingOptionId === option.id && showOptionFormForGroup === group.id) {
                    return (
                      <div key={option.id} className="px-4 py-2">
                        {renderOptionForm(group.id)}
                      </div>
                    );
                  }

                  const meta = TYPE_META[option.option_type];
                  const costStr = getOptionCostSummary(option);
                  const choiceSummary = getOptionChoiceSummary(option);

                  return (
                    <div
                      key={option.id}
                      className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => startEditOption(option)}
                    >
                      <div className={`w-7 h-7 rounded-lg ${meta.bg} ${meta.color} flex items-center justify-center flex-shrink-0`}>
                        {option.icon ? (
                          <OptionIcon iconKey={option.icon} className="w-4 h-4" />
                        ) : (
                          meta.icon
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{option.name}</span>
                          {option.is_required && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                              Req
                            </span>
                          )}
                        </div>
                        {(option.description || choiceSummary) && (
                          <div className="text-xs text-gray-400 mt-0.5 line-clamp-1 prose prose-xs prose-gray max-w-none [&_p]:m-0 [&_p]:inline">
                            {option.description ? (
                              <ReactMarkdown remarkPlugins={[remarkBreaks]}>{option.description}</ReactMarkdown>
                            ) : choiceSummary}
                          </div>
                        )}
                      </div>

                      {costStr && (
                        <span className="text-sm font-semibold text-green-700 flex-shrink-0">
                          {costStr}
                        </span>
                      )}

                      <button
                        onClick={(e) => { e.stopPropagation(); deleteOption(option); }}
                        className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  );
                })}

                {/* New option form (not editing an existing one) */}
                {!editingOptionId && showOptionFormForGroup === group.id && (
                  <div className="px-4 py-2">
                    {renderOptionForm(group.id)}
                  </div>
                )}

                {showOptionFormForGroup !== group.id && (
                  <div className="px-4 py-2.5">
                    <button
                      onClick={() => startNewOption(group.id)}
                      className="flex items-center gap-1.5 text-sm text-green-600 font-medium hover:text-green-700"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Add Option
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Add Group ── */}
      {showNewGroupForm ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-700">New Group</span>
          </div>
          <input
            autoFocus
            type="text"
            placeholder="Group name (e.g., Contest Entry Fees, Preferences)"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createGroup();
              if (e.key === "Escape") { setShowNewGroupForm(false); setNewGroupName(""); setNewGroupIcon(null); setIconPickerOpen(null); }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
          <div>
            {renderIconPickerButton("new-group", newGroupIcon, newGroupIcon ? "Change Icon" : "Add Icon")}
            {renderIconPicker("new-group", newGroupIcon, setNewGroupIcon)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={createGroup}
              disabled={!newGroupName.trim() || saving === "group"}
              className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 active:opacity-80"
            >
              {saving === "group" ? "Saving..." : "Create Group"}
            </button>
            <button
              onClick={() => { setShowNewGroupForm(false); setNewGroupName(""); setNewGroupIcon(null); setIconPickerOpen(null); }}
              className="px-4 py-2 border border-gray-300 text-sm font-semibold text-gray-600 rounded-xl active:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowNewGroupForm(true)}
          className="w-full flex items-center justify-center gap-2 py-3.5 border-2 border-dashed border-gray-300 rounded-2xl text-sm font-semibold text-gray-400 hover:border-green-400 hover:text-green-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add Group
        </button>
      )}

      {/* ── Confirm Modal ── */}
      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
