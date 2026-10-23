import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2ServerClient } from "@/lib/v2/supabase";
import { orgNameMode } from "@/lib/v2/orgs";
import { loadMyMoney } from "@/lib/v2/finance/my-money";
import styles from "@/app/new/new.module.css";

/**
 * Unified "My Money" (#237) — your balance + every charge across all events and
 * group contests, plus a settle-up layer (net per other person, with a Venmo
 * link). Read-only; a member only ever sees their own money.
 */
function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export default async function MyMoneyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const supabase = await v2ServerClient();
  const mode = await orgNameMode(supabase, org.id);
  const m = await loadMyMoney(supabase, org.id, ctx.userId, mode);

  const owes = m.balanceCents > 0;
  const credit = m.balanceCents < 0;
  const nothing = m.charges.length === 0 && m.paidCents === 0 && m.incoming.length === 0;

  return (
    <div className={`${styles.page} ${styles.orgPage}`}>
      <h1 className={styles.title}>My Money</h1>

      <div className={styles.balanceCard} data-state={owes ? "owes" : credit ? "credit" : "settled"}>
        <span className={styles.balanceLabel}>
          {owes ? "Balance due" : credit ? "You have a credit" : "All settled up"}
        </span>
        <span className={styles.balanceAmount}>{money(owes ? m.balanceCents : credit ? -m.balanceCents : 0)}</span>
        {m.owedToYouCents > 0 && <span className={styles.balanceSub}>Owed to you: {money(m.owedToYouCents)}</span>}
      </div>

      {nothing ? (
        <p className={styles.dnsHint} style={{ marginTop: 18 }}>
          Nothing on your account. Charges appear when you RSVP &ldquo;Attending,&rdquo; pick options, or join a contest with a buy-in.
        </p>
      ) : (
        <>
          {m.charges.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <p className={styles.sectionLabel}>What you owe</p>
              <div className={styles.memberList} style={{ marginTop: 4 }}>
                {m.charges.map((c, i) => (
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
                  <span className={styles.finRowAmount}>{money(m.chargesCents)}</span>
                </div>
                {m.paidCents > 0 && (
                  <div className={styles.finRow} style={{ fontWeight: 700 }}>
                    <div className={styles.finRowMain}><span className={styles.finRowName}>Paid</span></div>
                    <span className={styles.finRowAmount} data-credit="1">−{money(m.paidCents)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {m.settle.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <p className={styles.sectionLabel}>Settle up</p>
              <div className={styles.payeeList}>
                {m.settle.map((p) => (
                  <div key={p.payeeId} className={styles.payeeCard} data-credit={p.netCents < 0 ? "1" : undefined}>
                    <div className={styles.payeeHead}>
                      <span className={styles.payeeName}>{p.payeeName}</span>
                      <span className={styles.payeeNet} data-credit={p.netCents < 0 ? "1" : undefined}>
                        {p.netCents < 0 ? `owes you ${money(-p.netCents)}` : money(p.netCents)}
                      </span>
                    </div>
                    {p.netCents > 0 && (
                      p.venmoUrl ? (
                        <a className={styles.venmoBtn} href={p.venmoUrl} target="_blank" rel="noopener noreferrer">
                          Pay {p.payeeName} {money(p.netCents)} with Venmo
                        </a>
                      ) : (
                        <span className={styles.venmoMissing}>{p.payeeName} hasn&apos;t added a Venmo handle yet.</span>
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {m.incoming.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <p className={styles.sectionLabel}>Owed to you</p>
              <div className={styles.memberList} style={{ marginTop: 4 }}>
                {m.incoming.map((g) => (
                  <div key={g.fromUserId} className={styles.finRow}>
                    <div className={styles.finRowMain}><span className={styles.finRowName}>{g.fromName}</span></div>
                    <span className={styles.finRowAmount}>{money(g.netCents)}</span>
                  </div>
                ))}
              </div>
              <p className={styles.dnsHint} style={{ marginTop: 8 }}>
                From contests you collect. Mark someone paid once their Venmo lands.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
