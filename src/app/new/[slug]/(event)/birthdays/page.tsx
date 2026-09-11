import { redirect } from "next/navigation";
import Link from "next/link";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import {
  upcomingBirthdays,
  type PersonWithBirthdate,
  type UpcomingBirthday,
} from "@/lib/v2/birthday";
import { pickName } from "@/lib/v2/profile";
import styles from "@/app/new/new.module.css";
/* eslint-disable @next/next/no-img-element */

interface MemberRow {
  v2_profiles: {
    id: string;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    birthdate: string | null;
    avatar_url: string | null;
  } | null;
}

export default async function BirthdaysPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const supabase = await v2ServerClient();
  const { data } = await supabase
    .from("v2_memberships")
    .select("v2_profiles(id, display_name, first_name, last_name, birthdate, avatar_url)")
    .eq("org_id", org.id)
    .eq("status", "active");

  const people: PersonWithBirthdate[] = ((data as unknown as MemberRow[]) || [])
    .map((r) => r.v2_profiles)
    .filter((p): p is NonNullable<MemberRow["v2_profiles"]> => !!p && !!p.birthdate)
    .map((p) => ({
      id: p.id,
      name: pickName(p, org.name_display),
      avatarUrl: p.avatar_url,
      birthdate: p.birthdate as string,
    }));

  const upcoming = upcomingBirthdays(people);

  // Group by month, preserving the soonest-first order.
  const groups: { key: string; label: string; rows: UpcomingBirthday[] }[] = [];
  for (const b of upcoming) {
    let g = groups.find((x) => x.key === b.monthKey);
    if (!g) {
      g = { key: b.monthKey, label: b.monthLabel, rows: [] };
      groups.push(g);
    }
    g.rows.push(b);
  }

  return (
    <div className={`${styles.page} ${styles.orgPage}`}>
      <div className={styles.calHeader}>
        <Link href={`/new/${slug}`} className={styles.calBack} aria-label="Back">
          ←
        </Link>
        <h1 className={styles.calTitle}>Birthdays</h1>
      </div>

      {upcoming.length === 0 ? (
        <p className={styles.lede}>No birthdays on file yet.</p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className={styles.calMonth}>
            <p className={styles.calMonthLabel}>{g.label}</p>
            <div className={styles.calList}>
              {g.rows.map((b) => (
                <div
                  key={b.id}
                  className={styles.calRow}
                  data-today={b.isToday || undefined}
                >
                  {b.avatarUrl ? (
                    <img src={b.avatarUrl} alt="" className={styles.calAvatar} />
                  ) : (
                    <div className={styles.calAvatarFallback}>
                      {b.name[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                  <div className={styles.calWho}>
                    <span className={styles.calName}>{b.name}</span>
                    <span className={styles.calAge}>
                      {b.isToday ? `🎂 Turns ${b.ageTurning} today` : `Turns ${b.ageTurning}`}
                    </span>
                  </div>
                  <span className={styles.calDate}>{b.dateLabel}</span>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
