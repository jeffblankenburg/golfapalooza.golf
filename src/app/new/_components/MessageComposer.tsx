"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./MessageComposer.module.css";

export interface ComposerMember {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface ComposerPayload {
  content: string | null; // wire format, with @[Name](id) mention tokens
  imageFile: File | null; // a staged photo to upload
  gifUrl: string | null; // a picked GIF (already a URL)
}

const EMOJIS = ["😀","😂","🥹","😅","😊","😍","😎","🤔","😴","🙃","😳","🥳","😤","😭","😡","👍","👎","👏","🙌","🙏","💪","🔥","🎉","⛳","🏌️","🏆","💯","⚡","✅","❌","❤️","💚","👀","🤝","🍺","🤙"];

/**
 * Reusable message composer — mentions, photo upload, GIF search, emoji. Emits a
 * ComposerPayload to `onSend`; the parent handles the upload + API call and
 * returns true on success (the composer then clears). Members drive the @mention
 * autocomplete. Styled to the v2 design system.
 */
export default function MessageComposer({
  members,
  onSend,
  placeholder = "Add a comment…",
  menuPlacement = "above",
}: {
  members: ComposerMember[];
  onSend: (payload: ComposerPayload) => Promise<boolean>;
  placeholder?: string;
  menuPlacement?: "above" | "below";
}) {
  const [text, setText] = useState("");
  const [staged, setStaged] = useState<{ file: File; preview: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [panel, setPanel] = useState<"menu" | "emoji" | "gif" | null>(null);
  const [gifQuery, setGifQuery] = useState("");
  const [gifs, setGifs] = useState<{ id: string; url: string }[]>([]);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mentionMap = useRef<Map<string, string>>(new Map()); // "@Name" -> userId

  const autoGrow = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };

  function onTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setText(v);
    autoGrow();
    const caret = e.target.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const m = before.match(/@([\p{L}\p{N}'.\- ]{0,30})$/u);
    if (m && !before.slice(0, m.index).endsWith("]")) {
      setMention({ query: m[1].toLowerCase(), start: m.index ?? 0 });
    } else {
      setMention(null);
    }
  }

  function pickMention(member: ComposerMember) {
    if (!mention) return;
    const token = `@${member.displayName}`;
    const caret = taRef.current?.selectionStart ?? text.length;
    const next = text.slice(0, mention.start) + token + " " + text.slice(caret);
    mentionMap.current.set(token, member.userId);
    setText(next);
    setMention(null);
    requestAnimationFrame(() => {
      taRef.current?.focus();
      autoGrow();
    });
  }

  // Convert tracked "@Name" tokens to wire markup on send.
  function buildContent(raw: string): string {
    let out = raw;
    for (const [token, id] of mentionMap.current) out = out.split(token).join(`@[${token.slice(1)}](${id})`);
    return out;
  }

  function stageImage(file: File) {
    setStaged((cur) => {
      if (cur) URL.revokeObjectURL(cur.preview);
      return { file, preview: URL.createObjectURL(file) };
    });
    setPanel(null);
    requestAnimationFrame(() => taRef.current?.focus());
  }
  function clearStaged() {
    setStaged((cur) => {
      if (cur) URL.revokeObjectURL(cur.preview);
      return null;
    });
  }

  function openFilePicker(camera: boolean) {
    const input = fileRef.current;
    if (!input) return;
    if (camera) input.setAttribute("capture", "environment");
    else input.removeAttribute("capture");
    input.click();
    setPanel(null);
  }

  const mentionMatches = mention
    ? members.filter((m) => m.displayName.toLowerCase().includes(mention.query)).slice(0, 6)
    : [];

  // Giphy search.
  useEffect(() => {
    if (panel !== "gif") return;
    const key = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
    if (!key) return;
    let cancelled = false;
    const q = gifQuery.trim();
    const endpoint = q
      ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=24&rating=pg-13`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=24&rating=pg-13`;
    const t = setTimeout(() => {
      fetch(endpoint)
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          type GiphyItem = { id: string; images: { fixed_width: { url: string } } };
          setGifs((d.data || []).map((g: GiphyItem) => ({ id: g.id, url: g.images.fixed_width.url })));
        })
        .catch(() => {});
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [panel, gifQuery]);

  async function submit(payload: ComposerPayload): Promise<boolean> {
    if (sending) return false;
    setSending(true);
    try {
      return await onSend(payload);
    } finally {
      setSending(false);
    }
  }

  async function send() {
    const raw = text.trim();
    if (!raw && !staged) return;
    const ok = await submit({
      content: raw ? buildContent(raw) : null,
      imageFile: staged?.file ?? null,
      gifUrl: null,
    });
    if (ok) {
      setText("");
      setMention(null);
      mentionMap.current.clear();
      clearStaged();
      requestAnimationFrame(() => {
        if (taRef.current) taRef.current.style.height = "auto";
      });
    }
  }

  async function sendGif(url: string) {
    setPanel(null);
    await submit({ content: null, imageFile: null, gifUrl: url });
  }

  function insertEmoji(emoji: string) {
    const ta = taRef.current;
    if (!ta) {
      setText((t) => t + emoji);
      return;
    }
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + emoji.length;
      autoGrow();
    });
  }

  const panels = (
    <>
      {/* Attachment menu (from the "+"): Camera · Photos · GIFs · Emoji. */}
      {panel === "menu" && (
        <div className={styles.attachMenu}>
          <button type="button" className={styles.attachItem} onClick={() => openFilePicker(true)}>
            <span className={styles.attachIcon}>
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>
            </span>
            Camera
          </button>
          <button type="button" className={styles.attachItem} onClick={() => openFilePicker(false)}>
            <span className={styles.attachIcon}>
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="M21 16l-5-5-9 8" /></svg>
            </span>
            Photos
          </button>
          <button type="button" className={styles.attachItem} onClick={() => setPanel("gif")}>
            <span className={styles.attachIcon}><strong className={styles.attachGif}>GIF</strong></span>
            GIFs
          </button>
          <button type="button" className={styles.attachItem} onClick={() => setPanel("emoji")}>
            <span className={styles.attachIcon} aria-hidden>😊</span>
            Emoji
          </button>
        </div>
      )}

      {panel === "emoji" && (
        <div className={styles.emojiPanel}>
          {EMOJIS.map((e, i) => (
            <button key={i} type="button" className={styles.emojiBtn} onClick={() => insertEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
      )}

      {panel === "gif" && (
        <div className={styles.gifPanel}>
          <input className={styles.gifSearch} value={gifQuery} onChange={(e) => setGifQuery(e.target.value)} placeholder="Search GIFs" />
          <div className={styles.gifGrid}>
            {gifs.map((g) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={g.id} src={g.url} alt="" className={styles.gifItem} onClick={() => sendGif(g.url)} />
            ))}
            {gifs.length === 0 && <p className={styles.gifEmpty}>Search for a GIF…</p>}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className={styles.wrap} data-menu={menuPlacement}>
      {mentionMatches.length > 0 && (
        <div className={styles.mentionList}>
          {mentionMatches.map((m) => (
            <button key={m.userId} type="button" className={styles.mentionItem} onClick={() => pickMention(m)}>
              {m.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.avatarUrl} alt="" className={styles.mentionAvatar} />
              ) : (
                <span className={styles.mentionAvatarFallback}>{m.displayName.charAt(0).toUpperCase()}</span>
              )}
              <span className={styles.mentionName}>{m.displayName}</span>
            </button>
          ))}
        </div>
      )}

      {menuPlacement === "above" && panels}

      {staged && (
        <div className={styles.staged}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={staged.preview} alt="" className={styles.stagedImg} />
          <button type="button" className={styles.stagedClear} onClick={clearStaged} aria-label="Remove image">×</button>
        </div>
      )}

      <div className={styles.row}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) stageImage(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className={styles.plusBtn}
          data-open={panel !== null || undefined}
          onClick={() => setPanel((cur) => (cur === null ? "menu" : null))}
          aria-label="Add attachment"
          disabled={sending}
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <textarea
          ref={taRef}
          value={text}
          rows={1}
          onChange={onTextChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={placeholder}
          className={styles.textarea}
        />
        <button type="button" className={styles.sendBtn} onClick={send} disabled={sending || (!text.trim() && !staged)} aria-label="Send">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
        </button>
      </div>

      {menuPlacement === "below" && panels}
    </div>
  );
}
