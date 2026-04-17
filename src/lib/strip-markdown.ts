/**
 * Strip markdown formatting from content to produce plain text for previews.
 */
export function stripMarkdown(content: string, maxLen = 150): string {
  const stripped = content
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")       // images ![alt](url)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")     // links [text](url) → text
    .replace(/<[^>]+>/g, "")                      // HTML tags
    .replace(/^#{1,6}\s+/gm, "")                  // headings
    .replace(/(\*\*|__)(.*?)\1/g, "$2")           // bold
    .replace(/(\*|_)(.*?)\1/g, "$2")              // italic
    .replace(/~~(.*?)~~/g, "$1")                  // strikethrough
    .replace(/`([^`]+)`/g, "$1")                  // inline code
    .replace(/^[-*+]\s+/gm, "")                   // list items
    .replace(/\\\n/g, " ")                         // escaped line breaks
    .replace(/\n+/g, " ")                          // newlines
    .replace(/\s+/g, " ")                          // collapse whitespace
    .trim();
  return stripped.length > maxLen ? stripped.slice(0, maxLen) + "..." : stripped;
}
