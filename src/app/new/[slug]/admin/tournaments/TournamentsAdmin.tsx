"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/app/new/new.module.css";

interface TournamentRow { id: string; name: string; sport: string; season: string | null; status: string; source: string }

// Sports we can run a bracket for (March Madness is the reference).
const SPORTS = [
  { key: "mens-college-basketball", label: "Men's College Basketball (March Madness)" },
  { key: "womens-college-basketball", label: "Women's College Basketball" },
  { key: "nfl", label: "NFL Playoffs" },
  { key: "nhl", label: "Stanley Cup Playoffs" },
];

const STATUS_LABEL: Record<string, string> = { setup: "Setup", locked: "Locked", live: "Live", final: "Final" };

export default function TournamentsAdmin({ orgId, slug, tournaments }: { orgId: string; slug: string; tournaments: TournamentRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sport, setSport] = useState(SPORTS[0].key);
  const [season, setSeason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/v2/orgs/${orgId}/tournaments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), sport, season: season.trim() || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || "Could not create"); setBusy(false); return; }
      router.push(`/new/${slug}/admin/tournaments/${d.id}`);
    } catch { setErr("Something went wrong."); setBusy(false); }
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>Tournaments</h1>
        <p className={styles.sub}>Bracketed events your contests sit on — build the field, generate the bracket, enter results.</p>
      </div>

      <button type="button" className={styles.add} onClick={() => setOpen((o) => !o)}>+ New tournament</button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12, padding: 14, border: "1px solid var(--line)", borderRadius: 12 }}>
          <label>
            <span style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 }}>Name</span>
            <input className={styles.input} style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. March Madness 2027" maxLength={80} autoFocus />
          </label>
          <label>
            <span style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 }}>Sport</span>
            <select className={styles.selectInput} value={sport} onChange={(e) => setSport(e.target.value)}>
              {SPORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <label>
            <span style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 }}>Season <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(optional)</span></span>
            <input className={styles.input} style={{ width: "100%" }} value={season} onChange={(e) => setSeason(e.target.value)} placeholder="e.g. 2027" maxLength={12} />
          </label>
          {err && <p className={styles.err} style={{ margin: 0 }}>{err}</p>}
          <button type="button" className={styles.create} onClick={() => void create()} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
        {tournaments.length === 0 ? (
          <p className={styles.empty}>No tournaments yet. Create one above.</p>
        ) : (
          tournaments.map((t) => (
            <Link key={t.id} href={`/new/${slug}/admin/tournaments/${t.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 12, textDecoration: "none" }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 800, color: "var(--ink)" }}>{t.name}</span>
                <span style={{ display: "block", fontSize: "0.78rem", color: "var(--ink-soft)" }}>
                  {t.sport}{t.season ? `, ${t.season}` : ""}, {STATUS_LABEL[t.status] || t.status}
                </span>
              </span>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden style={{ color: "var(--ink-soft)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
