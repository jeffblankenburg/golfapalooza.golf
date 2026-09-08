"use client";

import { useEffect, useState, useCallback } from "react";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import Modal from "@/app/new/_components/Modal";
import { formatPhone } from "@/lib/v2/phone";
import styles from "@/app/new/new.module.css";

interface Member {
  user_id: string;
  role: "owner" | "admin" | "member";
  status: string;
  display_name: string;
  avatar_url: string | null;
}
interface Invite {
  id: string;
  phone: string;
  role: string;
  expires_at: string | null;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
}
type Confirm =
  | { kind: "removeMember"; id: string; label: string }
  | { kind: "revokeInvite"; id: string; label: string };

export default function MembersManager({
  orgId,
  currentUserId,
  currentRole,
}: {
  orgId: string;
  currentUserId: string;
  currentRole: "owner" | "admin" | "member";
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [phone, setPhone] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [iFirst, setIFirst] = useState("");
  const [iLast, setILast] = useState("");
  const [iNick, setINick] = useState("");
  const [iBday, setIBday] = useState("");
  const [iZip, setIZip] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const fetchMembers = useCallback(async (): Promise<Member[]> => {
    const r = await fetch(`/api/v2/orgs/${orgId}/members`);
    return r.ok ? (await r.json()).members || [] : [];
  }, [orgId]);
  const fetchInvites = useCallback(async (): Promise<Invite[]> => {
    const r = await fetch(`/api/v2/orgs/${orgId}/invites`);
    return r.ok ? (await r.json()).invites || [] : [];
  }, [orgId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [m, i] = await Promise.all([fetchMembers(), fetchInvites()]);
      if (active) {
        setMembers(m);
        setInvites(i);
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchMembers, fetchInvites]);

  const roleOptions =
    currentRole === "owner" ? ["owner", "admin", "member"] : ["admin", "member"];

  async function changeRole(userId: string, role: string) {
    setError(null);
    const res = await fetch(`/api/v2/orgs/${orgId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, role }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || "Could not change role");
    setMembers(await fetchMembers());
  }

  async function removeMember(userId: string) {
    const res = await fetch(`/api/v2/orgs/${orgId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || "Could not remove member");
    setMembers(await fetchMembers());
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim() || !iFirst.trim() || !iLast.trim() || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/v2/orgs/${orgId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: phone.trim(),
        role: inviteRole,
        first_name: iFirst,
        last_name: iLast,
        nickname: iNick,
        birthdate: iBday || null,
        zip: iZip,
      }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Could not send invite");
      return;
    }
    setPhone("");
    setIFirst("");
    setILast("");
    setINick("");
    setIBday("");
    setIZip("");
    setInviteOpen(false);
    setNotice(
      data.smsSent
        ? "Invite text sent."
        : `Invite created, but the text didn't send${data.smsError ? ` (${data.smsError})` : ""}. Share this link: ${data.link}`
    );
    setInvites(await fetchInvites());
  }

  async function revokeInvite(inviteId: string) {
    await fetch(`/api/v2/orgs/${orgId}/invites`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_id: inviteId }),
    });
    setInvites(await fetchInvites());
  }

  return (
    <>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Members</h1>
        <button
          type="button"
          className={styles.circleAdd}
          aria-label="Invite someone"
          onClick={() => {
            setError(null);
            setNotice(null);
            setInviteOpen(true);
          }}
        >
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionLabel}>People ({members.length})</p>
        <ul className={styles.memberList}>
          {members.map((m) => {
            const isSelf = m.user_id === currentUserId;
            const canManage =
              !isSelf && (currentRole === "owner" || m.role !== "owner");
            return (
              <li key={m.user_id} className={styles.memberRow}>
                {m.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.avatar_url} alt="" className={styles.memberAvatar} />
                ) : (
                  <span className={styles.memberAvatar}>{m.display_name.charAt(0).toUpperCase()}</span>
                )}
                <div className={styles.memberMeta}>
                  <span className={styles.memberName}>
                    {m.display_name}
                    {isSelf && <span className={styles.memberYou}> (you)</span>}
                  </span>
                </div>
                {canManage ? (
                  <>
                    <select
                      className={styles.roleSelect}
                      value={m.role}
                      onChange={(e) => changeRole(m.user_id, e.target.value)}
                    >
                      {roleOptions.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() =>
                        setConfirm({ kind: "removeMember", id: m.user_id, label: m.display_name })
                      }
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <span className={styles.roleBadge}>{m.role}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionLabel}>Invitations</p>
        {notice && <p className={styles.inviteNotice}>{notice}</p>}
        {error && !inviteOpen && <p className={styles.formError}>{error}</p>}

        {invites.length === 0 && !notice && (
          <p className={styles.dnsHint} style={{ marginTop: 0 }}>
            No pending invitations. Tap + above to invite someone.
          </p>
        )}

        {invites.length > 0 && (
          <ul className={styles.memberList} style={{ marginTop: 14 }}>
            {invites.map((iv) => {
              const fp = formatPhone(iv.phone);
              const name =
                iv.nickname ||
                [iv.first_name, iv.last_name].filter(Boolean).join(" ") ||
                null;
              return (
                <li key={iv.id} className={styles.memberRow}>
                  <div className={styles.memberMeta}>
                    <span className={styles.memberName}>
                      {name || `${fp.flag} ${fp.text}`.trim()}
                    </span>
                    <span className={styles.role}>
                      {name ? `${fp.flag} ${fp.text}, ` : ""}invited as {iv.role}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() =>
                      setConfirm({ kind: "revokeInvite", id: iv.id, label: fp.text })
                    }
                  >
                    Revoke
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal open={inviteOpen} title="Invite someone" onClose={() => setInviteOpen(false)}>
        <p className={styles.dnsHint} style={{ marginTop: 0 }}>
          They&apos;ll get a text with a one-time link to join with that number.
        </p>
        <form className={styles.form} onSubmit={sendInvite}>
          <div className={styles.field}>
            <label className={styles.label}>Phone number</label>
            <input
              className={styles.input}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>First name</label>
            <input className={styles.input} value={iFirst} onChange={(e) => setIFirst(e.target.value)} maxLength={40} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Last name</label>
            <input className={styles.input} value={iLast} onChange={(e) => setILast(e.target.value)} maxLength={40} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              Nickname <span className={styles.optional}>(optional)</span>
            </label>
            <input className={styles.input} value={iNick} onChange={(e) => setINick(e.target.value)} maxLength={40} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              Birthdate <span className={styles.optional}>(optional)</span>
            </label>
            <input className={styles.input} type="date" value={iBday} onChange={(e) => setIBday(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              Zip code <span className={styles.optional}>(optional)</span>
            </label>
            <input className={styles.input} inputMode="numeric" value={iZip} onChange={(e) => setIZip(e.target.value)} maxLength={10} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Role</label>
            <select className={styles.roleSelect} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
          </div>
          {error && <p className={styles.formError}>{error}</p>}
          <button
            type="submit"
            className={styles.createBtn}
            disabled={busy || !phone.trim() || !iFirst.trim() || !iLast.trim()}
          >
            {busy ? "Sending…" : "Send invite"}
          </button>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirm}
        title={confirm?.kind === "revokeInvite" ? "Revoke invite?" : "Remove member?"}
        message={
          confirm?.kind === "revokeInvite"
            ? `Revoke the invite to ${confirm?.label}? The link will stop working.`
            : `Remove ${confirm?.label} from this group?`
        }
        confirmLabel={confirm?.kind === "revokeInvite" ? "Revoke" : "Remove"}
        destructive
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c?.kind === "removeMember") removeMember(c.id);
          else if (c?.kind === "revokeInvite") revokeInvite(c.id);
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
