import { v2AdminClient } from "@/lib/v2/supabase";
import { buildMemberSchedule } from "@/lib/v2/schedule-feed";
import { toYMD } from "@/lib/v2/schedule";

/**
 * Public iCal feed for a group's MERGED schedule (#208). Unauthenticated on purpose
 * so calendar apps (which don't send our session) can subscribe via a webcal:// URL.
 * Gated by the org's unguessable UUID (an unlisted calendar).
 *
 * Composes the same feed members see — group items, active-event agendas, event
 * spans — but EXCLUDES derived birthdays: a public ICS shouldn't leak member
 * birthdates. Emits one VEVENT per entry.
 */

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
const ymd = (d: string) => d.replace(/-/g, "");
const hms = (t: string) => t.slice(0, 5).replace(":", "") + "00";

/** day + N days, as YYYYMMDD (for exclusive all-day DTEND). */
function addDays(dayStr: string, n: number): string {
  const d = new Date(dayStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const admin = v2AdminClient();

  const { data: org } = await admin.from("v2_organizations").select("id, name").eq("id", orgId).maybeSingle();
  if (!org) return new Response("Not found", { status: 404 });

  // Public feed → real calendar time (no simulator), and never leak birthdates.
  const today = toYMD(new Date());
  const entries = await buildMemberSchedule(admin, orgId, { slug: "", today, includeBirthdays: false });

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Golfapalooza//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(org.name)}`,
    `NAME:${esc(org.name)}`,
  ];

  for (const it of entries) {
    const timed = !it.all_day && !!it.start_time;
    // Fold the event context into the description so a bare calendar entry still
    // says which event it belongs to.
    const desc = [it.context, it.description].filter(Boolean).join("\n");
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${esc(it.id)}@golfapalooza.golf`);
    lines.push(`SUMMARY:${esc(it.title)}`);
    if (it.location) lines.push(`LOCATION:${esc(it.location)}`);
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
    if (timed) {
      lines.push(`DTSTART:${ymd(it.day)}T${hms(it.start_time!)}`);
      const endDay = it.end_day || it.day;
      lines.push(`DTEND:${ymd(endDay)}T${hms(it.end_time || it.start_time!)}`);
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
