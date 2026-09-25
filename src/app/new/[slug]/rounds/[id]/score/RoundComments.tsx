"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./score.module.css";
import MessageComposer, { type ComposerMember, type ComposerPayload } from "@/app/new/_components/MessageComposer";
import { useSimOffset } from "@/app/new/[slug]/(event)/SimTime";

interface Comment {
  id: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
  sender_id: string;
  sender: { id: string; display_name: string; avatar_url: string | null } | null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] || "?").toUpperCase();
}

function formatTime(dateStr: string, offset = 0) {
  const d = new Date(dateStr);
  const mins = Math.floor((Date.now() + offset - d.getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Render @[Name](id) mentions + bare URLs (mirrors chat's renderContent).
const MENTION_OR_URL = /@\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s]+)/g;
function renderContent(content: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  MENTION_OR_URL.lastIndex = 0;
  while ((m = MENTION_OR_URL.exec(content)) !== null) {
    if (m.index > last) nodes.push(content.slice(last, m.index));
    if (m[1]) {
      nodes.push(<span key={key++} className={styles.mention}>@{m[1]}</span>);
    } else if (m[3]) {
      nodes.push(
        <a key={key++} className={styles.commentLink} href={m[3]} target="_blank" rel="noopener noreferrer">{m[3]}</a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < content.length) nodes.push(content.slice(last));
  return nodes;
}

/**
 * Live comments on a v2 round with chat-parity input (mentions, photos, GIFs,
 * emoji via the shared MessageComposer). Own realtime channel.
 */
export default function RoundComments({ roundId, viewerId, orgId }: { roundId: string; viewerId: string; orgId: string }) {
  const simOffset = useSimOffset();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<ComposerMember[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
    }, 50);
  };

  const refetch = useCallback(
    (scroll: boolean) =>
      fetch(`/api/v2/rounds/${roundId}/comments`)
        .then((res) => (res.ok ? res.json() : { comments: [] }))
        .then((data) => {
          setComments(data.comments || []);
          setLoading(false);
          if (scroll) scrollToBottom();
        }),
    [roundId],
  );

  useEffect(() => {
    refetch(true);
  }, [refetch]);

  // Org roster for @mention autocomplete.
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetch(`/api/v2/chat/members?orgId=${orgId}&includeSelf=1`)
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => {
        if (!cancelled) setMembers(d.members || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`v2-round-comments:${roundId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "v2_round_comments", filter: `round_id=eq.${roundId}` },
        () => refetch(true),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roundId, refetch]);

  const handleSend = async ({ content, imageFile, gifUrl }: ComposerPayload): Promise<boolean> => {
    let imageUrl: string | null = gifUrl;
    try {
      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        const up = await fetch(`/api/v2/rounds/${roundId}/comments/upload`, { method: "POST", body: fd });
        if (!up.ok) return false;
        imageUrl = (await up.json()).url;
      }
      const res = await fetch(`/api/v2/rounds/${roundId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: content, imageUrl }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setComments((prev) => (prev.some((c) => c.id === data.comment.id) ? prev : [...prev, data.comment]));
      scrollToBottom("smooth");
      return true;
    } catch {
      return false;
    }
  };

  const remove = async (id: string) => {
    const prior = comments;
    setComments((prev) => prev.filter((c) => c.id !== id));
    const res = await fetch(`/api/v2/rounds/${roundId}/comments/${id}`, { method: "DELETE" });
    if (!res.ok) setComments(prior);
  };

  return (
    <div className={styles.comments}>
      <h2 className={styles.commentsTitle}>Comments</h2>
      <div ref={scrollRef} className={styles.commentList}>
        {loading && <p className={styles.commentEmpty}>Loading…</p>}
        {!loading && comments.length === 0 && <p className={styles.commentEmpty}>No comments yet — say something.</p>}
        {comments.map((c) => (
          <div key={c.id} className={styles.commentRow}>
            <span className={styles.commentAvatar}>
              {c.sender?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.sender.avatar_url} alt="" />
              ) : (
                initials(c.sender?.display_name || "?")
              )}
            </span>
            <div className={styles.commentBody}>
              <div className={styles.commentHead}>
                <span className={styles.commentName}>{c.sender?.display_name || "Player"}</span>
                <span className={styles.commentTime}>{formatTime(c.created_at, simOffset)}</span>
                {c.sender_id === viewerId && (
                  <button type="button" className={styles.commentDelete} onClick={() => remove(c.id)} aria-label="Delete comment">
                    Delete
                  </button>
                )}
              </div>
              {c.body && <p className={styles.commentText}>{renderContent(c.body)}</p>}
              {c.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.image_url} alt="" className={styles.commentImage} />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.commentForm}>
        <MessageComposer members={members} onSend={handleSend} placeholder="Add a comment…" menuPlacement="below" />
      </div>
    </div>
  );
}
