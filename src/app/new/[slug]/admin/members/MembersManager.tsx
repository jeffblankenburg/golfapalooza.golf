"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import Modal from "@/app/new/_components/Modal";
import { BottomDrawer } from "@/components/v2/BottomDrawer";
import { formatPhone } from "@/lib/v2/phone";
import type { NameMode } from "@/lib/v2/profile";
import { PERMISSION_GROUPS, type PermissionMap } from "@/lib/v2/permissions";
import styles from "@/app/new/new.module.css";

interface Member {
  user_id: string;
  role: "owner" | "admin" | "member";
  status: string;
  archived: boolean;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  birthdate: string | null;
  avatar_url: string | null;
  permissions: PermissionMap;
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

const fullName = (m: { first_name: string | null; last_name: string | null }) =>
  [m.first_name, m.last_name].filter(Boolean).join(" ").trim();

/** Primary / secondary name lines per the org's name-display mode. */
function displayLines(m: Member, mode: NameMode): { primary: string; secondary: string | null } {
  const full = fullName(m);
  if (mode === "real") {
    const primary = full || m.display_name || "Member";
    const nick = (m.nickname || "").trim();
    return { primary, secondary: nick && nick !== primary ? nick : null };
  }
  // nickname mode: display_name is already nickname-preferred.
  const primary = m.display_name || m.nickname || full || "Member";
  return { primary, secondary: full && full !== primary ? full : null };
}

/** Sort key: last name (real mode) or nickname (nickname mode), then a fallback. */
function sortKey(m: Member, mode: NameMode): string {
  const k =
    mode === "real"
      ? (m.last_name || "").trim() || (m.first_name || "").trim() || m.display_name
      : (m.nickname || "").trim() || m.display_name || fullName(m);
  return k.toLowerCase();
}

export default function MembersManager({
  orgId,
  currentUserId,
  currentRole,
  nameMode,
}: {
  orgId: string;
  currentUserId: string;
  currentRole: "owner" | "admin" | "member";
  nameMode: NameMode;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [query, setQuery] = useState("");
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
  const [showArchived, setShowArchived] = useState(false);

  // Edit-member modal state.
  const [editing, setEditing] = useState<Member | null>(null);
  const [eFirst, setEFirst] = useState("");
  const [eLast, setELast] = useState("");
  const [eNick, setENick] = useState("");
  const [eBday, setEBday] = useState("");
  const [eRole, setERole] = useState<"owner" | "admin" | "member">("member");
  const [eArchived, setEArchived] = useState(false);
  const [ePerms, setEPerms] = useState<PermissionMap>({});
  const [eBusy, setEBusy] = useState(false);
  const [eError, setEError] = useState<string | null>(null);

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

  const sorted = useMemo(
    () => [...members].sort((a, b) => sortKey(a, nameMode).localeCompare(sortKey(b, nameMode))),
    [members, nameMode],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((m) =>
      [m.first_name, m.last_name, m.nickname, m.display_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [sorted, query]);
  const activeMembers = filtered.filter((m) => !m.archived);
  const archivedMembers = filtered.filter((m) => m.archived);
  const activeTotal = members.filter((m) => !m.archived).length;
  // While searching, reveal matching archived members so they're findable.
  const archivedOpen = showArchived || (!!query.trim() && archivedMembers.length > 0);

  function openEdit(m: Member) {
    setEditing(m);
    setEFirst(m.first_name || "");
    setELast(m.last_name || "");
    setENick(m.nickname || "");
    setEBday(m.birthdate || "");
    setERole(m.role);
    setEArchived(m.archived);
    setEPerms(m.permissions || {});
    setEError(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || eBusy) return;
    const isSelf = editing.user_id === currentUserId;
    const canManage = !isSelf && (currentRole === "owner" || editing.role !== "owner");
    setEBusy(true);
    setEError(null);
    const body: {
      user_id: string;
      role?: string;
      profile: { first_name: string; last_name: string; nickname: string; birthdate: string | null };
      permissions?: PermissionMap;
      archived?: boolean;
    } = {
      user_id: editing.user_id,
      profile: {
        first_name: eFirst,
        last_name: eLast,
        nickname: eNick,
        birthdate: eBday || null,
      },
    };
    if (canManage && eArchived !== editing.archived) body.archived = eArchived;
    // Role & permissions only apply to an active member — archiving leaves the
    // stored role untouched so restoring keeps it.
    if (canManage && !eArchived && eRole !== editing.role) body.role = eRole;
    if (canManage && !eArchived && eRole === "member") body.permissions = ePerms;
    const res = await fetch(`/api/v2/orgs/${orgId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setEBusy(false);
    if (!res.ok) {
      setEError((await res.json().catch(() => ({}))).error || "Could not save");
      return;
    }
    setEditing(null);
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

  const editingSelf = editing?.user_id === currentUserId;
  const editingCanManage =
    !!editing && !editingSelf && (currentRole === "owner" || editing.role !== "owner");

  function renderMemberRow(m: Member) {
    const isSelf = m.user_id === currentUserId;
    const { primary, secondary } = displayLines(m, nameMode);
    return (
      <li key={m.user_id} className={styles.memberRow} style={{ padding: 0, border: "none" }}>
        <button type="button" className={styles.memberRowBtn} onClick={() => openEdit(m)}>
          {m.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.avatar_url} alt="" className={styles.memberAvatar} />
          ) : (
            <span className={styles.memberAvatar}>{primary.charAt(0).toUpperCase()}</span>
          )}
          <div className={styles.memberMeta}>
            <span className={styles.memberName}>
              {primary}
              {isSelf && <span className={styles.memberYou}> (you)</span>}
            </span>
            {secondary && <span className={styles.memberSub}>{secondary}</span>}
          </div>
          <span className={styles.roleBadge} style={m.archived ? { opacity: 0.55 } : undefined}>
            {m.archived ? "archived" : m.role}
          </span>
          <svg className={styles.arrow} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </li>
    );
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
        <p className={styles.sectionLabel}>People ({activeTotal})</p>
        <input
          className={`${styles.input} ${styles.memberSearch}`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members"
          aria-label="Search members"
        />
        <ul className={styles.memberList}>
          {activeMembers.map(renderMemberRow)}
          {filtered.length === 0 && (
            <p className={styles.dnsHint} style={{ marginTop: 0 }}>
              No members match &ldquo;{query}&rdquo;.
            </p>
          )}
          {filtered.length > 0 && activeMembers.length === 0 && (
            <p className={styles.dnsHint} style={{ marginTop: 0 }}>
              No active members{query.trim() ? " match" : ""}.
            </p>
          )}
        </ul>

        {archivedMembers.length > 0 && (
          <div className={styles.archivedGroup}>
            <button
              type="button"
              className={styles.archivedToggle}
              aria-expanded={archivedOpen}
              onClick={() => setShowArchived((v) => !v)}
            >
              <svg
                className={styles.archivedChevron}
                data-open={archivedOpen || undefined}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M9 5l7 7-7 7" />
              </svg>
              <span>Archived</span>
              <span className={styles.archivedCount}>{archivedMembers.length}</span>
            </button>
            {archivedOpen && <ul className={styles.memberList}>{archivedMembers.map(renderMemberRow)}</ul>}
          </div>
        )}
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

      {/* ── Edit member ─────────────────────────────────────────────────── */}
      <BottomDrawer open={!!editing} title="Edit member" onClose={() => setEditing(null)}>
        <div style={{ padding: "8px 18px 4px" }}>
        <form className={styles.form} onSubmit={saveEdit}>
          <div className={styles.field}>
            <label className={styles.label}>First name</label>
            <input className={styles.input} value={eFirst} onChange={(e) => setEFirst(e.target.value)} maxLength={40} autoFocus />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Last name</label>
            <input className={styles.input} value={eLast} onChange={(e) => setELast(e.target.value)} maxLength={40} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              Nickname <span className={styles.optional}>(optional)</span>
            </label>
            <input className={styles.input} value={eNick} onChange={(e) => setENick(e.target.value)} maxLength={40} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              Birthdate <span className={styles.optional}>(optional)</span>
            </label>
            <input className={styles.input} type="date" value={eBday} onChange={(e) => setEBday(e.target.value)} />
          </div>
          {editingCanManage && (
            <div className={styles.field}>
              <label className={styles.label}>Role</label>
              <select
                className={styles.roleSelect}
                value={eArchived ? "archived" : eRole}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "archived") setEArchived(true);
                  else {
                    setEArchived(false);
                    setERole(v as "owner" | "admin" | "member");
                  }
                }}
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
                <option value="archived">archived</option>
              </select>
              {eArchived && (
                <p className={styles.swatchHint}>
                  Archived members keep their access but drop into a collapsed group at the
                  bottom of the directory. Pick a role to restore them.
                </p>
              )}
            </div>
          )}

          {editingCanManage && !eArchived && (
            <div className={styles.field}>
              <label className={styles.label}>Permissions</label>
              {eRole !== "member" ? (
                <p className={styles.swatchHint}>
                  {eRole === "owner" ? "Owners" : "Admins"} have full access to everything in this group.
                </p>
              ) : (
                <>
                  <p className={styles.swatchHint}>
                    Give this member access to specific tools without making them an admin.
                  </p>
                  {PERMISSION_GROUPS.map((grp) => (
                    <div key={grp.key} className={styles.permGroup}>
                      {grp.items.map((perm) => (
                        <label key={perm.key} className={styles.permRow}>
                          <input
                            type="checkbox"
                            checked={!!ePerms[perm.key]}
                            onChange={(ev) =>
                              setEPerms((p) => ({ ...p, [perm.key]: ev.target.checked }))
                            }
                          />
                          <span className={styles.permText}>
                            <span className={styles.permLabel}>{perm.label}</span>
                            <span className={styles.permDesc}>{perm.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
          {eError && <p className={styles.formError}>{eError}</p>}
          <div className={styles.memberEditActions}>
            <button type="submit" className={styles.createBtn} disabled={eBusy}>
              {eBusy ? "Saving…" : "Save changes"}
            </button>
            {editingCanManage && (
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => {
                  const m = editing;
                  if (m) {
                    setEditing(null);
                    setConfirm({ kind: "removeMember", id: m.user_id, label: displayLines(m, nameMode).primary });
                  }
                }}
              >
                Remove
              </button>
            )}
          </div>
        </form>
        </div>
      </BottomDrawer>

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
