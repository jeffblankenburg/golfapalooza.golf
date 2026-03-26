"use client";

interface ItineraryItem {
  id: string;
  title: string;
  location: string | null;
  day_number: number | null;
  start_date: string | null;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getDayLabel(startDate: string, dayNum: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  const d = new Date(year, month - 1, day + dayNum - 1);
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

function formatDateReadable(dateStr: string | null): string {
  if (!dateStr) return "";
  const [, month, day] = dateStr.split("-").map(Number);
  return `${MONTH_SHORT[month - 1]} ${day}`;
}

export function ScheduleView({
  items,
  startDate,
}: {
  items: ItineraryItem[];
  startDate: string;
}) {
  const preEvent = items.filter((i) => i.day_number === null);
  const days = [1, 2, 3, 4];
  const dayItems = days.map((d) => items.filter((i) => i.day_number === d));

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>

      {/* Pre-Event */}
      {preEvent.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Pre-Event
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {preEvent.map((item) => (
              <div key={item.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                  {item.location && (
                    <p className="text-xs text-gray-500 mt-0.5">{item.location}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0 text-right">
                  {formatDateReadable(item.start_date)}
                  {item.end_date ? ` — ${formatDateReadable(item.end_date)}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Schedules */}
      {days.map((dayNum, idx) => {
        const dayItemsList = dayItems[idx];
        if (dayItemsList.length === 0) return null;

        return (
          <div key={dayNum} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-green-50 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-green-800 uppercase tracking-wide">
                Day {dayNum} — {getDayLabel(startDate, dayNum)}
              </h2>
            </div>
            <div className="divide-y divide-gray-100">
              {dayItemsList.map((item) => (
                <div key={item.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-shrink-0 w-20 pt-0.5">
                    <p className="text-xs font-medium text-green-700">
                      {formatTime(item.start_time)}
                    </p>
                    {item.end_time && (
                      <p className="text-xs text-gray-400">
                        {formatTime(item.end_time)}
                      </p>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                    {item.location && (
                      <p className="text-xs text-gray-500 mt-0.5">{item.location}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {items.length === 0 && (
        <p className="text-gray-500 text-center py-8">
          Schedule hasn&apos;t been published yet.
        </p>
      )}
    </div>
  );
}
