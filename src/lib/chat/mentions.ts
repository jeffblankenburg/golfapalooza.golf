// Issue: @-mention tagging in chat. Source of truth is the inline markup
// `@[Display Name](user-id)` embedded directly in chat_messages.content.
// Deleting any part of the markup naturally removes the mention because
// the regex no longer matches. Server fan-out and client rendering both
// derive from the same parse.

// uuid characters only — keeps the match from greedily eating adjacent
// text if someone writes literal "@[foo](bar)" without an id.
const UUID_RE = "[0-9a-fA-F-]{36}";
export const MENTION_RE = new RegExp(`@\\[([^\\]]+)\\]\\((${UUID_RE})\\)`, "g");

export interface MentionMatch {
  /** Display name as it was when the tag was inserted. */
  displayName: string;
  /** The mentioned user's id. */
  userId: string;
}

/**
 * Extract unique mentioned user ids from a message body. Order is
 * preserved (first occurrence wins). Returns an empty array for null /
 * empty content.
 */
export function parseMentions(content: string | null | undefined): MentionMatch[] {
  if (!content) return [];
  const seen = new Set<string>();
  const out: MentionMatch[] = [];
  for (const m of content.matchAll(MENTION_RE)) {
    const userId = m[2];
    if (seen.has(userId)) continue;
    seen.add(userId);
    out.push({ displayName: m[1], userId });
  }
  return out;
}

export type MessagePart =
  | { type: "text"; value: string }
  | { type: "mention"; displayName: string; userId: string };

/**
 * Split a message body into ordered text + mention segments for
 * rendering. Text segments retain their original characters (including
 * whitespace) so URL linkification etc. still works on the text pieces.
 */
export function splitMessageContent(content: string): MessagePart[] {
  if (!content) return [];
  const parts: MessagePart[] = [];
  let cursor = 0;
  // Use a fresh regex so we don't mutate the shared one's lastIndex.
  const re = new RegExp(MENTION_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > cursor) {
      parts.push({ type: "text", value: content.slice(cursor, m.index) });
    }
    parts.push({ type: "mention", displayName: m[1], userId: m[2] });
    cursor = m.index + m[0].length;
  }
  if (cursor < content.length) {
    parts.push({ type: "text", value: content.slice(cursor) });
  }
  return parts;
}

/**
 * Render mention markup down to a plain-text preview for places that
 * can't render rich chips (push notification bodies, reply previews,
 * room list "last message" snippets).
 */
export function stripMentionMarkup(content: string | null | undefined): string {
  if (!content) return "";
  return content.replace(MENTION_RE, (_, name) => `@${name}`);
}

/**
 * Build the to-be-sent `content` string from the user-facing textarea
 * value plus the list of mentions inserted via the @-picker.
 *
 * Why: the textarea shows clean text like "hi @Butter how are you", but
 * the server / renderer needs the markup form `@[Butter](uuid)`. We
 * preserve that mapping by tracking picker insertions in a parallel
 * `pendingMentions` list. On send, walk that list and rewrite the first
 * matching `@DisplayName` token to its markup form.
 *
 * Behavior:
 *   - Each entry transforms exactly ONE occurrence (so multiple picks of
 *     the same Loozer both get tagged).
 *   - If the user deleted or edited the `@DisplayName` text, the lookup
 *     fails and the entry silently drops (matches the spec: "deleting
 *     the @string also removes the tag").
 *   - A match requires a word-boundary or end-of-string after the
 *     display name, so `@Butter` is not matched inside `@Butterfly`.
 *   - Replacement walks left-to-right; once a span becomes markup it
 *     no longer matches `@DisplayName` literally, so re-matching is
 *     naturally avoided.
 */
export function buildContentWithMentions(
  text: string,
  pendingMentions: { userId: string; displayName: string }[],
): string {
  if (!text || pendingMentions.length === 0) return text;
  let out = text;
  for (const m of pendingMentions) {
    const needle = `@${m.displayName}`;
    let from = 0;
    while (from <= out.length) {
      const idx = out.indexOf(needle, from);
      if (idx === -1) break;
      const after = out[idx + needle.length];
      // Only match at end-of-string or non-word character; prevents
      // matching @Butter inside @Butterfly.
      if (after === undefined || !/\w/.test(after)) {
        out =
          out.slice(0, idx) +
          `@[${m.displayName}](${m.userId})` +
          out.slice(idx + needle.length);
        break;
      }
      from = idx + 1;
    }
  }
  return out;
}

/**
 * For the textarea-overlay highlighter: locate each pending mention's
 * `@DisplayName` token in the display text and return the spans. Same
 * matching rules as `buildContentWithMentions` (word-boundary, one-per-
 * entry, left-to-right) so the overlay agrees with what will be sent.
 *
 * Returns sorted, non-overlapping ranges into `text`.
 */
export function locateMentionSpans(
  text: string,
  pendingMentions: { userId: string; displayName: string }[],
): { start: number; end: number; userId: string; displayName: string }[] {
  if (!text || pendingMentions.length === 0) return [];
  const taken: boolean[] = new Array(text.length).fill(false);
  const spans: { start: number; end: number; userId: string; displayName: string }[] = [];
  for (const m of pendingMentions) {
    const needle = `@${m.displayName}`;
    let from = 0;
    while (from <= text.length) {
      const idx = text.indexOf(needle, from);
      if (idx === -1) break;
      const after = text[idx + needle.length];
      const endIdx = idx + needle.length;
      const isWordBoundary = after === undefined || !/\w/.test(after);
      // Only take the span if it's a valid word-bounded match AND its
      // characters haven't already been claimed by an earlier mention.
      let claimed = false;
      for (let i = idx; i < endIdx; i++) {
        if (taken[i]) { claimed = true; break; }
      }
      if (isWordBoundary && !claimed) {
        for (let i = idx; i < endIdx; i++) taken[i] = true;
        spans.push({ start: idx, end: endIdx, userId: m.userId, displayName: m.displayName });
        break;
      }
      from = idx + 1;
    }
  }
  spans.sort((a, b) => a.start - b.start);
  return spans;
}
