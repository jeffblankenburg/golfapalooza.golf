"use client";

import { useEffect, useState, useCallback } from "react";
import { routingRecordFor } from "@/lib/v2/dns";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import styles from "@/app/new/new.module.css";

interface VerificationRecord {
  type: string;
  domain: string;
  value: string;
}
interface Domain {
  id: string;
  hostname: string;
  verified: boolean;
  is_primary: boolean;
  misconfigured: boolean;
  verification: VerificationRecord[] | null;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={styles.copyBtn}
      aria-label="Copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // Clipboard unavailable (insecure context) — no-op.
        }
      }}
    >
      {copied ? (
        "Copied"
      ) : (
        <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <rect x="9" y="9" width="11" height="11" rx="2" strokeWidth="1.7" />
          <path strokeWidth="1.7" strokeLinecap="round" d="M5 15V5a2 2 0 012-2h10" />
        </svg>
      )}
    </button>
  );
}

export default function DomainsManager({ orgId }: { orgId: string }) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [hostname, setHostname] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; hostname: string } | null>(null);

  const fetchDomains = useCallback(async (): Promise<Domain[]> => {
    const res = await fetch(`/api/v2/orgs/${orgId}/domains`);
    if (!res.ok) return [];
    return (await res.json()).domains || [];
  }, [orgId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const d = await fetchDomains();
      if (active) setDomains(d);
    })();
    return () => {
      active = false;
    };
  }, [fetchDomains]);

  async function add() {
    if (!hostname.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v2/orgs/${orgId}/domains`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostname: hostname.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Could not add domain");
      return;
    }
    setHostname("");
    setDomains(await fetchDomains());
  }

  async function remove(domainId: string) {
    const res = await fetch(`/api/v2/orgs/${orgId}/domains`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain_id: domainId }),
    });
    if (res.ok) setDomains(await fetchDomains());
  }

  async function check(domainId: string) {
    setChecking(domainId);
    await fetch(`/api/v2/orgs/${orgId}/domains/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain_id: domainId }),
    });
    setDomains(await fetchDomains());
    setChecking(null);
  }

  const count = domains.length;

  return (
    <>
    <details className={styles.accordion}>
      <summary className={styles.accordionSummary}>
        <span>Custom domain{count > 0 ? ` (${count})` : ""}</span>
        <svg className={styles.chev} width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </summary>

      <div className={styles.accordionBody}>
        <p className={styles.dnsHint}>
          Use your own web address (like <em>golf.yourclub.com</em>). Members visit
          it and see the app skinned for your group.
        </p>

        {domains.map((d) => {
          const rec = routingRecordFor(d.hostname);
          return (
            <div key={d.id} className={styles.domainCard}>
              <div className={styles.domainRow}>
                <span className={styles.domainHost}>{d.hostname}</span>
                <span className={d.verified ? styles.badgeVerified : styles.badgePending}>
                  {d.verified ? "Active" : "Pending DNS"}
                </span>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => setConfirmRemove({ id: d.id, hostname: d.hostname })}
                  aria-label={`Remove ${d.hostname}`}
                >
                  Remove
                </button>
              </div>

              {!d.verified && (
                <div className={styles.dnsBlock}>
                  <p className={styles.dnsHint}>
                    Add this record at your DNS provider, then check status:
                  </p>
                  <div className={styles.dnsRecord}>
                    <span className={styles.dnsCell}><b>{rec.type}</b></span>
                    <span className={styles.dnsCell}>{rec.name}</span>
                    <code className={styles.code}>{rec.value}</code>
                    <CopyButton value={rec.value} />
                  </div>
                  {(d.verification || []).map((v, i) => (
                    <div key={i} className={styles.dnsRecord}>
                      <span className={styles.dnsCell}><b>{v.type}</b></span>
                      <span className={styles.dnsCell}>{v.domain}</span>
                      <code className={styles.code}>{v.value}</code>
                      <CopyButton value={v.value} />
                    </div>
                  ))}
                  <button
                    type="button"
                    className={styles.fileBtn}
                    onClick={() => check(d.id)}
                    disabled={checking === d.id}
                    style={{ marginTop: 10 }}
                  >
                    {checking === d.id ? "Checking…" : "Check status"}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <div className={styles.domainAdd}>
          <input
            className={styles.input}
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="golf.yourclub.com"
            inputMode="url"
            autoCapitalize="none"
          />
          <button
            type="button"
            className={styles.fileBtn}
            onClick={() => add()}
            disabled={busy || !hostname.trim()}
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
        {error && <p className={styles.formError}>{error}</p>}
        <p className={styles.instructionsNote}>
          HTTPS is issued automatically once your DNS is correct — the status flips
          to Active on its own, usually within minutes of the record propagating.
        </p>
      </div>
    </details>
    <ConfirmModal
      open={!!confirmRemove}
      title="Remove domain?"
      message={
        confirmRemove
          ? `Remove ${confirmRemove.hostname}? Members using this address will lose access until it's re-added.`
          : undefined
      }
      confirmLabel="Remove"
      destructive
      onConfirm={() => {
        const id = confirmRemove?.id;
        setConfirmRemove(null);
        if (id) remove(id);
      }}
      onCancel={() => setConfirmRemove(null)}
    />
    </>
  );
}
