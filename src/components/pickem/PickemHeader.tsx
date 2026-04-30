import Image from "next/image";

/**
 * Shared header for /pickem. Big when picks aren't open yet, smaller when they are.
 *
 * Asset: public/whitey.png — transparent PNG.
 */
export function PickemHeader({
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
        src="/whitey.png"
        alt="Whitey's Pickem"
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
