import Image from "next/image";

/**
 * Shared header for every KGB Cup state (forming, hidden, tee sheet, leaderboard).
 * Renders the shield logo in place of the "KGB Cup" text title and keeps the
 * admin link / extras inline, sized to be visible without taking over the page.
 */
export function KgbCupHeader({
  headerAction,
  children,
  size = 120,
}: {
  headerAction?: React.ReactNode;
  children?: React.ReactNode;
  size?: number;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      <Image
        src="/kgb-cup-logo.png"
        alt="KGB Cup"
        width={size}
        height={size}
        priority
        unoptimized
        className="select-none"
      />
      {headerAction}
      {children}
    </div>
  );
}
