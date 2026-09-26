import { v2AdminClient } from "@/lib/v2/supabase";

/**
 * Public iCal feed for an event's schedule (#208). Unauthenticated on purpose so
 * calendar apps (which don't send our session) can subscribe via a webcal:// URL.
 * Safe: the schedule holds no personal data and the URL is gated by the event's
 * unguessable UUID (an unlisted calendar). Emits one VEVENT per schedule item.
 */

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
const ymd = (d: string) => d.replace(/-/g, "");
const hms = (t: string) => t.slice(0, 5).replace(":", "") + "00";

/** end_day/day + N days, as YYYYMMDD (for exclusive all-day DTEND). */
function addDays(dayStr: string, n: number): string {
  const d = new Date(dayStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const admin = v2AdminClient();

  const { data: event } = await admin.from("v2_events").select("id, name").eq("id", eventId).maybeSingle();
  if (!event) return new Response("Not found", { status: 404 });

  const { data: items } = await admin
    .from("v2_schedule_items")
    .select("id, title, description, location, day, end_day, start_time, end_time, all_day, updated_at:created_at")
    .eq("event_id", eventId)
    .order("day");

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Golfapalooza//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(event.name)}`,
    `NAME:${esc(event.name)}`,
  ];

  for (const it of items || []) {
    const timed = !it.all_day && !!it.start_time;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${it.id}@golfapalooza.golf`);
    lines.push(`SUMMARY:${esc(it.title)}`);
    if (it.location) lines.push(`LOCATION:${esc(it.location)}`);
    if (it.description) lines.push(`DESCRIPTION:${esc(it.description)}`);
    if (timed) {
      lines.push(`DTSTART:${ymd(it.day)}T${hms(it.start_time!)}`);
      const endDay = it.end_day || it.day;
      if (it.end_time) lines.push(`DTEND:${ymd(endDay)}T${hms(it.end_time)}`);
      else lines.push(`DTEND:${ymd(endDay)}T${hms(it.start_time!)}`);
    } else {
      // All-day (or untimed): DATE values; DTEND is exclusive, so end_day + 1.
      lines.push(`DTSTART;VALUE=DATE:${ymd(it.day)}`);
      lines.push(`DTEND;VALUE=DATE:${addDays(it.end_day || it.day, 1)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="schedule.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
