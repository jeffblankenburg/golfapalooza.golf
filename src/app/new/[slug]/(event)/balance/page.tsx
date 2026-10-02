import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2ServerClient } from "@/lib/v2/supabase";
import { loadMemberBalance, sourceLabel } from "@/lib/v2/balances";
import styles from "@/app/new/new.module.css";

/**
 * Member "My Balance" (#214) — what you owe for the event: Trip Cost (if attending) +
 * your selected Options, minus any payments/credits an admin has recorded. Mirrors v1's
 * MyFinancials. Read-only; a member only ever sees their own money.
 */
function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export default async function MemberBalancePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const supabase = await v2ServerClient();
  const { data: ev } = await supabase
    .from("v2_events").select("id, name").eq("org_id", org.id).eq("status", "active").order("start_date", { ascending: false }).limit(1).maybeSingle();
  if (!ev) redirect(`/new/${slug}`);

  const bal = await loadMemberBalance(supabase, ev.id as string, ctx.userId);
  const owes = bal.balanceCents > 0;
  const credit = bal.balanceCents < 0;

  return (
    <div className={`${styles.page} ${styles.orgPage}`}>
      <h1 className={styles.title}>My Balance</h1>

      <div className={styles.balanceCard} data-state={owes ? "owes" : credit ? "credit" : "settled"}>
        <span className={styles.balanceLabel}>
          {owes ? "Balance due" : credit ? "You have a credit" : "All settled up"}
        </span>
        <span className={styles.balanceAmount}>
          {owes ? money(bal.balanceCents) : credit ? money(-bal.balanceCents) : money(0)}
        </span>
      </div>

      {bal.charges.length === 0 && bal.payments.length === 0 ? (
        <p className={styles.dnsHint} style={{ marginTop: 18 }}>Nothing on your account yet. Charges appear when you RSVP &ldquo;Attending&rdquo; or pick options.</p>
      ) : (
        <>
          {bal.charges.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <p className={styles.sectionLabel}>What you owe</p>
              <div className={styles.memberList} style={{ marginTop: 4 }}>
                {bal.charges.map((c, i) => (
                  <div key={i} className={styles.finRow}>
                    <div className={styles.finRowMain} style={{ minWidth: 0 }}>
                      <span className={styles.finRowName}>{c.label}</span>
                      {c.sublabel && <span className={styles.cscAllMeta}>{c.sublabel}</span>}
                    </div>
                    <span className={styles.finRowAmount}>{money(c.amountCents)}</span>
                  </div>
                ))}
                <div className={styles.finRow} style={{ fontWeight: 700 }}>
                  <div className={styles.finRowMain}><span className={styles.finRowName}>Owed</span></div>
                  <span className={styles.finRowAmount}>{money(bal.owedCents)}</span>
                </div>
              </div>
            </div>
          )}

          {bal.payments.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <p className={styles.sectionLabel}>Payments &amp; credits</p>
              <div className={styles.memberList} style={{ marginTop: 4 }}>
                {bal.payments.map((p) => (
                  <div key={p.id} className={styles.finRow}>
                    <div className={styles.finRowMain} style={{ minWidth: 0 }}>
                      <span className={styles.finRowName}>{p.description || sourceLabel(p.source)}{p.method ? ` (${p.method})` : ""}</span>
                      {p.notes && <span className={styles.cscAllMeta}>{p.notes}</span>}
                    </div>
                    <span className={styles.finRowAmount} data-credit="1">−{money(p.amountCents)}</span>
                  </div>
                ))}
                <div className={styles.finRow} style={{ fontWeight: 700 }}>
                  <div className={styles.finRowMain}><span className={styles.finRowName}>Paid</span></div>
                  <span className={styles.finRowAmount}>−{money(bal.paidCents)}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
