import Link from "next/link";
import styles from "@/app/new/new.module.css";
import { optionValueIsEmpty, selectionIsActive } from "@/lib/v2/options";
import { type MemberOption } from "./optionControls";

/**
 * Home-page options nudge (#218). Not a wizard anymore — just a card that links to the
 * familiar options page. Pulses while any required, visible option is still unanswered.
 * Rendered only while options are open.
 */
export default function OptionsReminder({
  slug, options, initialSelections,
}: {
  slug: string;
  options: MemberOption[];
  initialSelections: Record<string, unknown>;
}) {
  const sel = initialSelections;
  const byId = new Map(options.map((o) => [o.id, o]));
  // Pure option-to-option dependency (v1 parity) — a hidden dependent doesn't nag.
  const visible = (o: MemberOption): boolean => {
    if (!o.depends_on_option_id) return true;
    const p = byId.get(o.depends_on_option_id);
    return p ? selectionIsActive(p.option_type, sel[p.id]) : true;
  };
  const shown = options.filter(visible);
  if (shown.length === 0) return null;

  const incomplete = shown.filter((o) => o.is_required && optionValueIsEmpty(o.option_type, sel[o.id])).length;
  const complete = incomplete === 0;

  return (
    <div className={styles.module}>
      <Link href={`/new/${slug}/options`} className={`${styles.optReminder}${complete ? "" : ` ${styles.optReminderPulse}`}`}>
        <span>
          <span className={styles.optReminderTitle}>{complete ? "Your options" : "Complete your options"}</span>
          <span className={styles.optReminderSub}>{complete ? "Review or change your picks" : `${incomplete} still need${incomplete === 1 ? "s" : ""} an answer`}</span>
        </span>
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" /></svg>
      </Link>
    </div>
  );
}
