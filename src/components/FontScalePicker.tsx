"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fontScaleToPercent, type FontScale } from "@/lib/font-scale";

const OPTIONS: { value: FontScale; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
  { value: "xlarge", label: "Extra Large" },
];

/**
 * Issue #138. Per-user text size picker. Writes users.font_scale and
 * applies the change immediately by overriding html font-size, so the
 * user sees the result without a reload. The next page render will pick
 * up the same value from (app)/layout.tsx's server-injected <style>.
 */
export function FontScalePicker({
  userId,
  initialScale,
}: {
  userId: string;
  initialScale: FontScale;
}) {
  const [scale, setScale] = useState<FontScale>(initialScale);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Drive the document's root font-size from local state so the preview
  // AND the rest of the app reflect the user's choice without waiting
  // for a server round-trip. The server-rendered <style> in (app)/layout
  // sets the initial value; this effect takes over once the user picks.
  useEffect(() => {
    document.documentElement.style.fontSize = fontScaleToPercent(scale);
  }, [scale]);

  const handleSelect = async (next: FontScale) => {
    if (next === scale || saving) return;
    const prev = scale;
    setScale(next);
    setError("");

    setSaving(true);
    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("users")
      .update({ font_scale: next })
      .eq("id", userId);
    setSaving(false);

    if (saveError) {
      // Revert on failure so what the user sees matches what's persisted.
      setScale(prev);
      setError("Couldn't save text size");
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Text Size
      </h3>

      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => {
          const selected = scale === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt.value)}
              disabled={saving}
              aria-pressed={selected}
              className={`py-3 rounded-xl border text-sm font-medium transition-colors ${
                selected
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-white text-gray-700 border-gray-300 active:bg-gray-50"
              } disabled:opacity-60`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Live preview — uses rem so it reflects the actual change. */}
      <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
          Preview
        </p>
        <p className="text-base text-gray-900 leading-snug">
          If you ever feel like something isn&rsquo;t working the way you
          think it should, you&rsquo;re probably right. Just text Quack.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
