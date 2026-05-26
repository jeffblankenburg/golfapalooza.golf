"use client";

import { BottomDrawer } from "@/components/admin/BottomDrawer";

interface CourseHelpDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Issue #133. Persistent "how to edit" drawer for the courses surface.
 * Triggered from both the detail page header and the map editor itself.
 * No first-time gating — Loozers can reopen this whenever they need a
 * refresher.
 */
export function CourseHelpDrawer({ open, onClose }: CourseHelpDrawerProps) {
  return (
    <BottomDrawer open={open} onClose={onClose} title="Editing a course">
      <div className="px-6 py-4 space-y-5 text-sm text-gray-700">
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">The five mapped points</h3>
          <p className="text-gray-600 mb-2">
            Each hole, on each set of tees, has five GPS points. Together they let the live scorer show accurate distances, drawn corridors, and green geometry on the satellite map.
          </p>
          <ul className="space-y-1.5">
            <li>
              <strong>Tee location.</strong> Where you tee off from <em>this set of tees</em>. This is the only point that differs between black / blue / white / etc. — each set has its own.
            </li>
            <li>
              <strong>Green center.</strong> The middle of the green. Shared across every set of tees on the same hole.
            </li>
            <li>
              <strong>Green front.</strong> The leading edge of the green from the playing line. Used to calculate green depth.
            </li>
            <li>
              <strong>Green back.</strong> The far edge of the green. Together with the front, this gives the green its depth in yards.
            </li>
            <li>
              <strong>Ideal drive.</strong> Where a well-struck drive should land — the corridor the app draws the laser line through. If you don&apos;t place one, the map auto-suggests a spot <strong>250 yards from the current tee toward the green center</strong>. Drag or re-tap to override.
            </li>
          </ul>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Mapping a hole, step by step</h3>
          <ol className="space-y-1.5 list-decimal list-inside text-gray-600">
            <li>Open a hole from the holes list and tap <strong>Edit map</strong>.</li>
            <li>Pick which point you&apos;re placing from the button row.</li>
            <li>Tap the satellite map where that point belongs. The button toggles off; the map shows a marker.</li>
            <li>To move a point, tap its button again and drop a new one — the old one is replaced.</li>
            <li>To clear a point, tap its button and then tap the marker.</li>
            <li>Hit <strong>Save</strong> at the bottom of the editor when you&apos;re done.</li>
          </ol>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Hole data — par, yardage, handicap</h3>
          <p className="text-gray-600">
            Par, yardage, and handicap index are <em>per set of tees</em>. Editing them on the Blue tees doesn&apos;t touch the White tees. Hole names (like &quot;Heartbreak&quot;) are shared across every set.
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Locked courses</h3>
          <p className="text-gray-600">
            Some courses — typically the active event course and Loozer favorites — are locked by admins so the data stays stable. You can still browse a locked course, but the edit buttons won&apos;t show. If you spot something wrong, ping an admin.
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">What about my old scorecards?</h3>
          <p className="text-gray-600">
            Editing a course <strong>doesn&apos;t</strong> change scores that have already been saved. Your handicap, score differential, and gross totals are snapshotted when the round is completed. The only thing that follows the current course data is the &quot;birdie / bogey&quot; label drawn against par on the round detail page — which means if you correct a hole&apos;s par after the fact, those labels will reflect the new value.
          </p>
        </section>
      </div>
    </BottomDrawer>
  );
}
