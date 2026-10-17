/**
 * Payment deep-links (#230). We never move money — these just open Venmo / PayPal
 * with the amount + note prefilled so the admin pays with one tap. Usernames are
 * stored bare (no @, no URL); we rebuild the canonical link here.
 */

const bare = (u: string | null | undefined): string | null => {
  const t = (u || "").trim().replace(/^@/, "");
  return t || null;
};
const dollars = (cents: number): string => (cents / 100).toFixed(2);

/** Venmo pay intent — opens the app/site with recipient, amount, and note filled. */
export function venmoLink(username: string | null | undefined, amountCents: number, note: string): string | null {
  const u = bare(username);
  if (!u) return null;
  const params = new URLSearchParams({ txn: "pay", amount: dollars(amountCents), note });
  return `https://venmo.com/${encodeURIComponent(u)}?${params.toString()}`;
}

/** PayPal.Me link with the amount baked into the path. */
export function paypalLink(username: string | null | undefined, amountCents: number): string | null {
  const u = bare(username);
  if (!u) return null;
  return `https://paypal.me/${encodeURIComponent(u)}/${dollars(amountCents)}`;
}
