/**
 * Ref-counted body scroll lock shared by Modal / ConfirmModal. Nested modals
 * (e.g. a delete confirm opened over an edit modal) each lock; the original
 * overflow is captured only on the first lock and restored only when the last
 * lock releases — so closing both never leaves the page stuck unscrollable.
 */
let count = 0;
let saved = "";

export function lockScroll(): void {
  if (typeof document === "undefined") return;
  if (count === 0) {
    saved = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  count += 1;
}

export function unlockScroll(): void {
  if (typeof document === "undefined") return;
  count = Math.max(0, count - 1);
  if (count === 0) {
    document.body.style.overflow = saved;
  }
}
