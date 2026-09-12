/**
 * Neutralize PostgREST filter grammar in a user-supplied search term before it
 * is interpolated into a `.or(...)` / `.ilike(...)` filter STRING.
 *
 * This is NOT about classic SQL injection — PostgREST already sends values as
 * bound parameters. It's about PostgREST *filter injection*: characters like
 * `,` `(` `)` `.` `:` are part of the `or=` grammar, so raw input in a filter
 * string can alter the filter logic or break the query. We strip those plus the
 * `%`/`*` wildcards (the caller adds its own `%`) and cap the length.
 *
 * Use this for any search term that gets interpolated into a filter string.
 */
export function sanitizeSearchTerm(input: string | null | undefined, maxLen = 100): string {
  return (input ?? "")
    .replace(/[,()."\\:%*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}
