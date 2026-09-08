import { parsePhoneNumberFromString } from "libphonenumber-js";

/** Phone helpers for v2. Best-effort E.164; a leading + passes through so any
 * country prefix works (not just +1). Default assumes US for bare 10/11 digits. */
export function toE164(raw: string): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) {
    const p = parsePhoneNumberFromString(trimmed);
    return p?.isValid() ? p.number : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export interface FormattedPhone {
  flag: string; // emoji flag for the origin country, or "" if unknown
  text: string; // national format for US/CA, international otherwise
  e164: string;
}

/** ISO 3166-1 alpha-2 → regional-indicator flag emoji. */
function flagFromCountry(cc?: string): string {
  if (!cc || cc.length !== 2) return "";
  return cc
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

/** Format an E.164 number for display, appropriately for its country of origin. */
export function formatPhone(e164: string): FormattedPhone {
  const p = parsePhoneNumberFromString(e164 || "");
  if (!p) return { flag: "", text: e164 || "", e164: e164 || "" };
  const national = p.country === "US" || p.country === "CA";
  return {
    flag: flagFromCountry(p.country),
    text: national ? p.formatNational() : p.formatInternational(),
    e164: p.number,
  };
}
