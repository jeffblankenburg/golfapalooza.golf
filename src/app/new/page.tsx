import Link from "next/link";
import { redirect } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import styles from "./new.module.css";

interface EventRow {
  id: string;
  org_id: string;
  name: string;
  year: number | null;
  status: string;
  start_date: string | null;
}

export default async function NewHome() {
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");

  // Members of exactly one group skip the chooser and land in that group.
  // The picker only matters at 0 groups (create/join) or 2+ (owners/admins).
  if (ctx.orgs.length === 1) redirect(`/new/${ctx.orgs[0].slug}`);

  const supabase = await v2ServerClient();
  const orgIds = ctx.orgs.map((o) => o.id);
  const { data } = await supabase
    .from("v2_events")
    .select("id, org_id, name, year, status, start_date")
    .in("org_id", orgIds.length ? orgIds : ["00000000-0000-0000-0000-000000000000"])
    .order("year", { ascending: false });
  const events = (data || []) as EventRow[];

  const eventsByOrg = new Map<string, EventRow[]>();
  for (const e of events) {
    const list = eventsByOrg.get(e.org_id) || [];
    list.push(e);
    eventsByOrg.set(e.org_id, list);
  }

  return (
    <div className={styles.page}>
      <p className={styles.eyebrow}>Golf, organized</p>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Your groups</h1>
        <Link href="/new/create" className={styles.circleAdd} aria-label="Create new group">
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      </div>
      <p className={styles.lede}>
        Every club and outing you belong to, in one place. Pick a group to see its
        events and games.
      </p>

      <div className={styles.rule} />

      {ctx.orgs.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No groups yet</p>
          <p className={styles.emptyText}>
            Create your own group above, or join one with an invite code from its
            organizer.
          </p>
        </div>
      ) : (
        <div className={styles.cards}>
          {ctx.orgs.map((org, i) => {
            const evs = eventsByOrg.get(org.id) || [];
            return (
              <Link
                key={org.id}
                href={`/new/${org.slug}`}
                className={styles.card}
                style={{ animationDelay: `${i * 70}ms` } as React.CSSProperties}
              >
                <div className={styles.cardHead}>
                  {org.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={org.logo_url} alt="" className={styles.monogramImg} />
                  ) : (
                    <span className={styles.monogram}>
                      {org.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className={styles.orgName}>{org.name}</div>
                    <div className={styles.role}>{org.role}</div>
                  </div>
                  <svg
                    className={styles.arrow}
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" />
                  </svg>
                </div>

                {evs.length > 0 ? (
                  <ul className={styles.events}>
                    {evs.slice(0, 3).map((e) => (
                      <li key={e.id} className={styles.event}>
                        <span className={styles.eventName}>
                          {e.name}
                          {e.year ? ` (${e.year})` : ""}
                        </span>
                        <span className={styles.eventStatus}>{e.status}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.eventEmpty}>No events yet</p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
