import { redirect } from "next/navigation";
import Link from "next/link";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { getSystemProfile } from "@/lib/v2/system-user";
import { pickName } from "@/lib/v2/profile";
import styles from "@/app/new/new.module.css";
import AnnouncementsList, { type MemberAnnouncement } from "./AnnouncementsList";

interface SenderRef {
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
}
interface Row {
  id: string;
  title: string;
  body: string | null;
  audience_type: "everyone" | "event" | "custom";
  audience_user_ids: string[] | null;
  event_id: string | null;
  sent_at: string | null;
  send_as_system: boolean;
  sender: SenderRef | SenderRef[] | null;
}

/**
 * Member-facing announcements history — every sent announcement the viewer was an
 * audience for (everyone, an event they're in, or a custom list including them).
 * Reached from the activity feed and from an announcement notification tap
 * (?a=<id> scrolls to + highlights that one). Uses the service role because the
 * v2_announcements table is admin-only under RLS.
 */
export default async function AnnouncementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ a?: string }>;
}) {
  const { slug } = await params;
  const { a: highlightId } = await searchParams;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const admin = v2AdminClient();
  const [annRes, partRes, systemProfile] = await Promise.all([
    admin
      .from("v2_announcements")
      .select(
        "id, title, body, audience_type, audience_user_ids, event_id, sent_at, send_as_system, sender:v2_profiles!v2_announcements_created_by_fkey(display_name, first_name, last_name, nickname, avatar_url)",
      )
      .eq("org_id", org.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false }),
    admin
      .from("v2_event_participants")
      .select("event_id")
      .eq("user_id", ctx.userId)
      .neq("status", "not_going"),
    getSystemProfile(admin),
  ]);

  const alName = systemProfile?.display_name || "Al Pine";
  const alAvatar = systemProfile?.avatar_url || "/alpine.png";

  const myEvents = new Set((partRes.data || []).map((p) => p.event_id));
  const visible: MemberAnnouncement[] = ((annRes.data as Row[] | null) || [])
    .filter(
      (r) =>
        r.audience_type === "everyone" ||
        (r.audience_type === "custom" && (r.audience_user_ids || []).includes(ctx.userId)) ||
        (r.audience_type === "event" && !!r.event_id && myEvents.has(r.event_id)),
    )
    .map((r) => {
      const sender = Array.isArray(r.sender) ? r.sender[0] ?? null : r.sender;
      // Members see the presented author: Al Pine when chosen, otherwise the
      // real sender. (The admin page always shows the real sender.)
      const authorName = r.send_as_system ? alName : sender ? pickName(sender, org.name_display) : null;
      const authorAvatar = r.send_as_system ? alAvatar : sender?.avatar_url ?? null;
      return {
        id: r.id,
        title: r.title,
        body: r.body,
        authorName,
        authorAvatar,
        dateText: r.sent_at
          ? new Date(r.sent_at).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })
          : "",
      };
    });

  return (
    <div className={`${styles.page} ${styles.orgPage}`}>
      <Link href={`/new/${slug}`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </Link>

      <p className={styles.eyebrow}>{org.name}</p>
      <h1 className={styles.title} style={{ marginBottom: 24 }}>Announcements</h1>

      {visible.length === 0 ? (
        <p className={styles.lede}>No announcements yet. Check back soon.</p>
      ) : (
        <AnnouncementsList items={visible} highlightId={highlightId || null} />
      )}
    </div>
  );
}
