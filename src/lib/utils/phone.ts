/**
 * Normalize a phone number to 10 digits (US format)
 * Strips all non-digits and takes the last 10 digits
 * This handles formats like: +15551234567, 15551234567, 5551234567, (555) 123-4567
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "").slice(-10);
}

/**
 * Format a 10-digit phone to E.164 format for Supabase Auth
 * Returns +1XXXXXXXXXX format
 */
export function toE164(phone: string): string {
  const normalized = normalizePhone(phone);
  return `+1${normalized}`;
}

/**
 * Format a phone number for display
 * Returns (XXX) XXX-XXXX format
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  const normalized = normalizePhone(phone);
  if (normalized.length !== 10) return phone || "";
  return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}
