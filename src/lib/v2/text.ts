/** Plain-text helpers for v2. Kept local so v2 shares no code with the legacy app. */

/** Strip markdown/HTML to plain text for previews, truncating to maxLen. */
export function stripMarkdown(content: string, maxLen = 200): string {
  const stripped = content
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")   // images ![alt](url)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links [text](url) → text
    .replace(/<[^>]+>/g, "")                  // HTML tags
    .replace(/^#{1,6}\s+/gm, "")              // headings
    .replace(/(\*\*|__)(.*?)\1/g, "$2")       // bold
    .replace(/(\*|_)(.*?)\1/g, "$2")          // italic
    .replace(/~~(.*?)~~/g, "$1")              // strikethrough
    .replace(/`([^`]+)`/g, "$1")              // inline code
    .replace(/^[-*+]\s+/gm, "")               // list bullets
    .replace(/\\\n/g, " ")                     // escaped line breaks
    .replace(/\n+/g, " ")                      // newlines
    .replace(/\s+/g, " ")                      // collapse whitespace
    .trim();
  return stripped.length > maxLen ? stripped.slice(0, maxLen).trimEnd() + "…" : stripped;
}
