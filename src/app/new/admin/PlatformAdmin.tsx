"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/app/new/new.module.css";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
/* eslint-disable @next/next/no-img-element */

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdLabel: string;
  creatorName: string | null;
  memberCount: number;
  eventCount: number;
  activeEventName: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
}

export interface Candidate {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isSystemAdmin: boolean;
  search: string;
}

type Pending = { kind: "grant" | "revoke"; userId: string; name: string };

const firstName = (n: string | null) => (n || "owner").trim().split(/\s+/)[0] || "owner";

/**
 * Platform system-admin console UI. Lists every group (with "Open" + "View as
 * owner"), and manages the system-admin roster (grant/revoke, confirmed, with a
 * last-admin lockout guard mirrored on the server).
 */
export default function PlatformAdmin({
  orgs,
  candidates,
  currentUserId,
}: {
  orgs: OrgRow[];
  candidates: Candidate[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);

  const admins = candidates.filter((c) => c.isSystemAdmin);
  const query = q.trim().toLowerCase();
  const addable = query
    ? candidates.filter((c) => !c.isSystemAdmin && c.search.includes(query)).slice(0, 8)
    : [];

  async function impersonate(o: OrgRow) {
    if (busy || !o.ownerUserId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v2/sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: o.ownerUserId }),
      });
      if (res.ok) window.location.href = `/new/${o.slug}`;
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  async function runPending() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v2/admin/system-admins", {
        method: pending.kind === "grant" ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: pending.userId }),
      });
      if (res.ok) {
        setPending(null);
        setQ("");
        router.refresh();
      }
    } catch {
      /* leave the modal open so the user can retry */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* ── All groups ───────────────────────────────────────────────── */}
      <section className={styles.section}>
        <p className={styles.sectionLabel}>All groups ({orgs.length})</p>
        {orgs.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No groups yet</p>
            <p className={styles.emptyText}>When someone creates a group, it shows up here.</p>
          </div>
        ) : (
          <div className={styles.cards}>
            {orgs.map((o) => (
              <div key={o.id} className={styles.card}>
                <div className={styles.cardHead}>
                  {o.logoUrl ? (
                    <img src={o.logoUrl} alt="" className={styles.monogramImg} />
                  ) : (
                    <span className={styles.monogram}>{o.name.charAt(0).toUpperCase()}</span>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className={styles.orgName}>{o.name}</div>
                    <div className={styles.role}>
                      {o.memberCount} {o.memberCount === 1 ? "member" : "members"}, {o.eventCount}{" "}
                      {o.eventCount === 1 ? "event" : "events"}
                    </div>
                  </div>
                </div>

                <p className={styles.roundFormHint} style={{ margin: "10px 0 0" }}>
                  {o.activeEventName ? `Active event: ${o.activeEventName}` : "No active event"}
                  <br />
                  Created {o.createdLabel}
                  {o.creatorName ? ` by ${o.creatorName}` : ""}
                </p>

                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <Link href={`/new/${o.slug}`} className={styles.createBtnGhost}>
                    Open
                  </Link>
                  {o.ownerUserId && (
                    <button
                      type="button"
                      className={styles.createBtn}
                      onClick={() => impersonate(o)}
                      disabled={busy}
                      style={{ opacity: busy ? 0.6 : 1 }}
                    >
                      View as {firstName(o.ownerName)}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── System admins ────────────────────────────────────────────── */}
      <section className={styles.section}>
        <p className={styles.sectionLabel}>System admins ({admins.length})</p>
        <p className={styles.roundFormHint} style={{ marginTop: -2, marginBottom: 10 }}>
          System admins can see and manage every group on the platform, and view the app as any member.
        </p>

        <div className={styles.memberList}>
          {admins.map((a) => (
            <div key={a.userId} className={styles.memberRow}>
              {a.avatarUrl ? (
                <img src={a.avatarUrl} alt="" className={styles.memberAvatar} />
              ) : (
                <span className={styles.memberAvatar} aria-hidden>
                  {(a.name[0] || "?").toUpperCase()}
                </span>
              )}
              <div className={styles.memberMeta} style={{ minWidth: 0 }}>
                <div className={styles.memberName}>
                  {a.name}
                  {a.userId === currentUserId ? " (you)" : ""}
                </div>
                <div className={styles.memberSub}>System admin</div>
              </div>
              <button
                type="button"
                className={styles.deleteBtn}
                disabled={busy || admins.length <= 1}
                title={admins.length <= 1 ? "Can't remove the last system admin" : undefined}
                onClick={() => setPending({ kind: "revoke", userId: a.userId, name: a.name })}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <label className={styles.label} style={{ marginTop: 18 }}>
          Add a system admin
        </label>
        <input
          className={styles.input}
          placeholder="Search members…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {query && (
          <div className={styles.simList} style={{ maxHeight: 300, marginTop: 6 }}>
            {addable.map((c) => (
              <button
                key={c.userId}
                type="button"
                className={styles.simMember}
                disabled={busy}
                onClick={() => setPending({ kind: "grant", userId: c.userId, name: c.name })}
              >
                {c.avatarUrl ? (
                  <img src={c.avatarUrl} alt="" className={styles.simMemberAvatar} />
                ) : (
                  <span className={styles.simMemberAvatarFallback}>{(c.name[0] || "?").toUpperCase()}</span>
                )}
                <span className={styles.simMemberName}>{c.name}</span>
              </button>
            ))}
            {addable.length === 0 && <p className={styles.roundFormHint}>No members found.</p>}
          </div>
        )}
      </section>

      <ConfirmModal
        open={!!pending}
        destructive={pending?.kind === "revoke"}
        title={pending?.kind === "revoke" ? "Remove system admin?" : "Make system admin?"}
        message={
          pending?.kind === "revoke"
            ? `${pending?.name} will lose access to the platform console and can no longer manage other groups.`
            : `${pending?.name} will be able to see and manage every group on the platform, and view the app as any member.`
        }
        confirmLabel={pending?.kind === "revoke" ? "Remove" : "Make admin"}
        onConfirm={runPending}
        onCancel={() => (busy ? undefined : setPending(null))}
      />
    </div>
  );
}
