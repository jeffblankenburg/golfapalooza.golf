"use client";

import { useState, useEffect } from "react";
import TeeForm from "./TeeForm";
import HoleEditor from "./HoleEditor";
import { getTeeDotStyle } from "@/lib/utils/tee-colors";
import { BTN_NEUTRAL, BTN_PRIMARY } from "@/lib/ui/buttons";

interface Tee {
  id: string;
  tee_name: string;
  tee_color: string | null;
  course_rating: number;
  slope_rating: number;
  par: number;
  total_yards: number | null;
  front_nine_rating: number | null;
  front_nine_slope: number | null;
  back_nine_rating: number | null;
  back_nine_slope: number | null;
}

interface HoleData {
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number | null;
}

interface TeeListProps {
  courseId: string;
  tees: Tee[];
  onRefresh: () => void;
  locked?: boolean;
}

export default function TeeList({ courseId, tees, onRefresh, locked = false }: TeeListProps) {
  const [editingTee, setEditingTee] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedTee, setExpandedTee] = useState<string | null>(null);
  const [holesMap, setHolesMap] = useState<Record<string, HoleData[]>>({});
  const [loadingHoles, setLoadingHoles] = useState<string | null>(null);

  // Fetch holes when a tee is expanded
  useEffect(() => {
    if (!expandedTee || holesMap[expandedTee]) return;

    async function fetchHoles() {
      setLoadingHoles(expandedTee);
      const res = await fetch(`/api/courses/${courseId}/tees/${expandedTee}/holes`);
      const data = await res.json();
      setHolesMap((prev) => ({ ...prev, [expandedTee!]: data.holes || [] }));
      setLoadingHoles(null);
    }
    fetchHoles();
  }, [expandedTee, courseId, holesMap]);

  function toggleExpand(teeId: string) {
    setExpandedTee(expandedTee === teeId ? null : teeId);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Tee Boxes</h3>
        {!showAddForm && !locked && (
          <button
            onClick={() => setShowAddForm(true)}
            className={BTN_PRIMARY}
          >
            + Add Tee
          </button>
        )}
      </div>

      {tees.map((tee) => (
        <div key={tee.id}>
          {editingTee === tee.id ? (
            <TeeForm
              courseId={courseId}
              tee={tee}
              onSaved={() => {
                setEditingTee(null);
                onRefresh();
              }}
              onCancel={() => setEditingTee(null)}
            />
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {(() => {
                    const dot = getTeeDotStyle(tee.tee_color);
                    return <span className={`w-4 h-4 rounded-full inline-block ${dot.className || ""}`} style={dot.style} />;
                  })()}
                  <span className="font-medium text-gray-900">{tee.tee_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {!locked && (
                    <button
                      onClick={() => setEditingTee(tee.id)}
                      className={BTN_PRIMARY}
                    >
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => toggleExpand(tee.id)}
                    className={BTN_NEUTRAL}
                  >
                    {expandedTee === tee.id ? "Hide Holes" : "Holes"}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-xs text-gray-500">Rating</div>
                  <div className="text-sm font-medium">{tee.course_rating}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Slope</div>
                  <div className="text-sm font-medium">{tee.slope_rating}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Par</div>
                  <div className="text-sm font-medium">{tee.par}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Yards</div>
                  <div className="text-sm font-medium">{tee.total_yards || "—"}</div>
                </div>
              </div>

              {/* Expanded hole editor */}
              {expandedTee === tee.id && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  {loadingHoles === tee.id ? (
                    <div className="text-center py-4 text-sm text-gray-500">Loading holes...</div>
                  ) : holesMap[tee.id] ? (
                    locked ? (
                      <HoleReadOnly holes={holesMap[tee.id]} />
                    ) : (
                      <HoleEditor
                        courseId={courseId}
                        teeId={tee.id}
                        holes={holesMap[tee.id]}
                        onSaved={() => {
                          // Clear cached holes so they reload fresh
                          setHolesMap((prev) => {
                            const next = { ...prev };
                            delete next[tee.id];
                            return next;
                          });
                          setExpandedTee(null);
                          onRefresh();
                        }}
                      />
                    )
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {tees.length === 0 && !showAddForm && (
        <p className="text-sm text-gray-500 text-center py-4">No tee boxes yet</p>
      )}

      {showAddForm && !locked && (
        <TeeForm
          courseId={courseId}
          onSaved={() => {
            setShowAddForm(false);
            onRefresh();
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}

// Read-only hole display for locked courses
function HoleReadOnly({ holes }: { holes: HoleData[] }) {
  const frontNine = holes.filter((h) => h.hole_number <= 9);
  const backNine = holes.filter((h) => h.hole_number > 9);

  function renderNine(nineHoles: HoleData[], label: string) {
    return (
      <div className="mb-3">
        <div className="text-xs font-semibold text-gray-500 mb-1">{label}</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-200">
              <th className="text-left py-1 font-medium">Hole</th>
              {nineHoles.map((h) => (
                <th key={h.hole_number} className="text-center py-1 font-medium w-7">{h.hole_number}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="py-1 text-gray-600">Par</td>
              {nineHoles.map((h) => (
                <td key={h.hole_number} className="text-center py-1">{h.par}</td>
              ))}
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-1 text-gray-600">Hdcp</td>
              {nineHoles.map((h) => (
                <td key={h.hole_number} className="text-center py-1">{h.handicap_index}</td>
              ))}
            </tr>
            <tr>
              <td className="py-1 text-gray-600">Yds</td>
              {nineHoles.map((h) => (
                <td key={h.hole_number} className="text-center py-1">{h.yards || "—"}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      {frontNine.length > 0 && renderNine(frontNine, "Front 9")}
      {backNine.length > 0 && renderNine(backNine, "Back 9")}
    </div>
  );
}
