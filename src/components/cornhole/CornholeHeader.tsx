import Image from "next/image";

/**
 * Shared header for the /cornhole page. Big size when brackets aren't ready,
 * small size when they are (so the logo doesn't crowd out the bracket grid).
 *
 * Asset: drop a transparent PNG at public/cornhole-logo.png.
 */
export function CornholeHeader({
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
        src="/cornhole-logo.png"
        alt="Cornhole"
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
