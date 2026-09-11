import Link from "next/link";
import { v2ServerClient } from "@/lib/v2/supabase";
import { stripMarkdown } from "@/lib/v2/text";
import { pickName, type NameMode } from "@/lib/v2/profile";
import { todayInTimezone, ageTurningToday } from "@/lib/v2/birthday";
import BirthdayBanner, { type BirthdayPerson } from "./BirthdayBanner";
import RsvpModule, { type Likelihood } from "./RsvpModule";
import AdCarousel, { type Ad } from "./AdCarousel";
import ActivityFeed from "./ActivityFeed";
import type { ActivityRow } from "@/lib/v2/activity";
import styles from "@/app/new/new.module.css";
/* eslint-disable @next/next/no-img-element */

/**
 * Event-home module stack. Each module is condition-gated: it renders only when
 * it has something to say (a birthday today, an article to feature, …). While we
 * build out the real data sources everything is STUBBED — a module with no live
 * data still renders a labeled preview card (the small "preview" tag) so the
 * layout can be designed. Swap `PREVIEW` handling for the real empty-state
 * (return null) as each source comes online.
 *
 * Order follows the agreed home layout:
 *   1 Birthdays · 2 Current Article · 3 Registration · 4 Store · 5 Recent Rounds · 6 Ads
 */

const PREVIEW = true; // while stubbing: show empty modules as labeled previews.

interface MemberProfile {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  birthdate: string | null;
  avatar_url: string | null;
}

function birthdaysToday(
  rows: { v2_profiles: MemberProfile | null }[],
  mode: NameMode,
): BirthdayPerson[] {
  const today = todayInTimezone();
  const mmdd = `${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  return rows
    .map((r) => r.v2_profiles)
    .filter((p): p is MemberProfile => !!p && !!p.birthdate)
    .filter((p) => (p.birthdate as string).slice(5) === mmdd) // YYYY-MM-DD → MM-DD
    .map((p) => ({
      id: p.id,
      name: pickName(p, mode),
      avatarUrl: p.avatar_url,
      age: ageTurningToday(p.birthdate as string, today.year),
    }));
}

export default async function HomeModules({
  orgId,
  eventId,
  userId,
  slug,
  eventName,
  storeUrl,
  storeLabel,
  storeEnabled,
  nameDisplay,
}: {
  orgId: string;
  eventId: string;
  userId: string;
  slug: string;
  eventName: string;
  storeUrl: string | null;
  storeLabel: string | null;
  storeEnabled: boolean;
  nameDisplay: NameMode;
}) {
  const supabase = await v2ServerClient();

  const nowIso = new Date().toISOString();

  // Birthdays + article + RSVP + attending count + ads + activity, in parallel.
  const [membersRes, articleRes, myRsvpRes, goingRes, attendingRes, adsRes, activityRes] =
    await Promise.all([
    supabase
      .from("v2_memberships")
      .select("user_id, v2_profiles(id, display_name, first_name, last_name, birthdate, avatar_url)")
      .eq("org_id", orgId)
      .eq("status", "active"),
    // Latest published article for the org (event-specific scoping comes later).
    supabase
      .from("v2_articles")
      .select(
        "id, title, publish_at, image_url, content, image_focal_x, image_focal_y, author:v2_profiles(display_name, first_name, last_name, avatar_url)",
      )
      .eq("org_id", orgId)
      .not("publish_at", "is", null)
      .lte("publish_at", nowIso)
      .order("publish_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("v2_event_participants")
      .select("likelihood")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("v2_event_participants")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId),
    supabase
      .from("v2_event_participants")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("on_roster", true),
    supabase
      .from("v2_ads")
      .select("id, image_url, alt_text")
      .eq("org_id", orgId)
      .eq("active", true),
    supabase
      .from("v2_activity")
      .select("id, kind, title, subtitle, image_url, link, created_at, metadata, actor:v2_profiles(display_name, first_name, last_name, avatar_url)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const myLikelihood = (myRsvpRes.data?.likelihood as Likelihood | undefined) ?? null;
  const responseCount = goingRes.count ?? 0;
  const attendingCount = attendingRes.count ?? 0;
  const ads = (adsRes.data as Ad[] | null) ?? [];
  const activity = ((activityRes.data as unknown as (Omit<ActivityRow, "actor"> & {
    actor: ActivityRow["actor"] | ActivityRow["actor"][];
  })[]) ?? []).map((a) => ({
    ...a,
    actor: Array.isArray(a.actor) ? a.actor[0] ?? null : a.actor,
  })) as ActivityRow[];

  const birthdays = birthdaysToday(
    (membersRes.data as unknown as { v2_profiles: MemberProfile | null }[]) || [],
    nameDisplay,
  );

  // Featured article (null until 00185 is applied / an article is published).
  const row = articleRes.error ? null : (articleRes.data as ArticleRow | null);
  const rowAuthor = row ? (Array.isArray(row.author) ? row.author[0] : row.author) : null;
  const article: FeaturedArticle | null = row
    ? {
        id: row.id,
        title: row.title,
        publishAt: row.publish_at,
        imageUrl: row.image_url,
        preview: stripMarkdown(row.content || "") || null,
        focalX: row.image_focal_x ?? 50,
        focalY: row.image_focal_y ?? 50,
        authorName: rowAuthor ? pickName(rowAuthor, nameDisplay) : null,
        authorAvatar: rowAuthor?.avatar_url ?? null,
      }
    : null;

  return (
    <>
      <BirthdayBanner birthdays={birthdays} slug={slug} />
      <ArticleModule article={article} slug={slug} />
      <RsvpModule
        eventId={eventId}
        eventName={eventName}
        initialLikelihood={myLikelihood}
        initialResponseCount={responseCount}
        initialAttendingCount={attendingCount}
      />
      <StoreModule storeUrl={storeEnabled ? storeUrl : null} storeLabel={storeLabel} />
      <ActivityFeed initialItems={activity} orgId={orgId} />
      <AdCarousel ads={ads} />
    </>
  );
}

/* ── 1 · Birthdays lives in BirthdayBanner.tsx (client: balloons + sayings) ── */

/* ── 2 · Current Article ─────────────────────────────────────────────────── */
interface ArticleAuthor {
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}
interface ArticleRow {
  id: string;
  title: string;
  publish_at: string;
  image_url: string | null;
  content: string | null;
  image_focal_x: number | null;
  image_focal_y: number | null;
  author: ArticleAuthor | ArticleAuthor[] | null;
}
interface FeaturedArticle {
  id: string;
  title: string;
  publishAt: string;
  imageUrl: string | null;
  preview: string | null;
  focalX: number;
  focalY: number;
  authorName: string | null;
  authorAvatar: string | null;
}

const STUB_ARTICLE: FeaturedArticle = {
  id: "",
  title: "The feature article will headline here",
  publishAt: "2027-09-01",
  imageUrl: null,
  preview:
    "The first couple sentences of the most recent article show up right here, giving Loozers a taste before they tap through to read the whole thing.",
  focalX: 50,
  focalY: 50,
  authorName: null,
  authorAvatar: null,
};

function ArticleModule({ article, slug }: { article: FeaturedArticle | null; slug: string }) {
  if (!article && !PREVIEW) return null;
  const a = article ?? STUB_ARTICLE;

  const dateText = new Date(a.publishAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Real articles link to their reading page; the stub preview isn't clickable.
  const href = a.id ? `/new/${slug}/articles/${a.id}` : null;
  const inner = (
    <>
      <div className={styles.articleImage}>
          {a.imageUrl && (
            <img
              src={a.imageUrl}
              alt=""
              style={{ objectPosition: `${a.focalX}% ${a.focalY}%` }}
            />
          )}
          <div className={styles.articleImageScrim} />
          <div className={styles.articleImageText}>
            <p className={styles.articleOverlayTitle}>{a.title}</p>
            <div className={styles.articleMeta}>
              <span className={styles.articleDate}>{dateText}</span>
              {a.authorName && (
                <span className={styles.articleAuthorGroup}>
                  {a.authorAvatar ? (
                    <img className={styles.articleMetaAvatar} src={a.authorAvatar} alt="" />
                  ) : (
                    <span className={styles.articleMetaAvatarFallback}>
                      {a.authorName[0]?.toUpperCase() || "?"}
                    </span>
                  )}
                  <span className={styles.articleMetaAuthor}>{a.authorName}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        {a.preview && (
          <div className={styles.articleExcerptWrap}>
            <p className={styles.articleExcerpt}>{a.preview}</p>
          </div>
        )}
    </>
  );

  return (
    <section className={styles.module}>
      {href ? (
        <Link href={href} className={styles.articleCard}>
          {inner}
        </Link>
      ) : (
        <div className={styles.articleCard}>{inner}</div>
      )}
    </section>
  );
}

/* ── 3 · Registration lives in RsvpModule.tsx (client: picker + write) ─────── */

/* ── 4 · Store — external merch link, admin-configured. Hidden when unset. ──── */
function StoreModule({
  storeUrl,
  storeLabel,
}: {
  storeUrl: string | null;
  storeLabel: string | null;
}) {
  if (!storeUrl) return null;

  return (
    <section className={styles.module}>
      <a
        className={styles.storeCard}
        href={storeUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className={styles.storeIcon} aria-hidden>
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        </span>
        <span className={styles.storeTitle}>{storeLabel || "Shop the store"}</span>
        <span className={styles.storeArrow} aria-hidden>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M14 5h5v5m0-5L9 15M5 9v10h10" />
          </svg>
        </span>
      </a>
    </section>
  );
}

/* ── 5 · Activity feed lives in ActivityFeed.tsx (reads v2_activity) ───────── */

/* ── 6 · Sponsors lives in AdCarousel.tsx (client: shuffle + rotate, no header) ── */
