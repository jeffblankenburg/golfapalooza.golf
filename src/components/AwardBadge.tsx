// Renders an award badge image when one is uploaded; falls back to the emoji
// icon otherwise. Sizes are kept consistent across surfaces (profile rows,
// public Accolades headers, admin previews) so layouts don't shift when an
// admin swaps an emoji for a badge image.

interface Props {
  iconUrl: string | null | undefined;
  emoji: string | null | undefined;
  alt?: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  /** When true, fills the parent (parent must constrain dimensions). Overrides `size`. */
  fill?: boolean;
  className?: string;
}

const SIZE_PX: Record<NonNullable<Props["size"]>, number> = {
  sm: 20,
  md: 28,
  lg: 40,
  xl: 96,
  "2xl": 112,
};

const TEXT_SIZE_CLASS: Record<NonNullable<Props["size"]>, string> = {
  sm: "text-base",
  md: "text-2xl",
  lg: "text-3xl",
  xl: "text-7xl",
  "2xl": "text-8xl",
};

export function AwardBadge({
  iconUrl,
  emoji,
  alt = "",
  size = "sm",
  fill = false,
  className = "",
}: Props) {
  if (fill) {
    // Both modes sized via container query units (Tailwind v4 + `@container`)
    // so the visible badge is the same percentage of the cell whether it's
    // an emoji or an uploaded image, regardless of source image aspect ratio.
    return (
      <div className={`@container w-full h-full grid place-items-center ${className}`}>
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={iconUrl}
            alt={alt}
            className="block object-contain"
            style={{ width: "98cqi", height: "98cqi" }}
          />
        ) : (
          <span
            className="leading-none"
            style={{ fontSize: "120cqi" }}
            aria-label={alt || undefined}
            role={alt ? "img" : undefined}
          >
            {emoji ?? "🏆"}
          </span>
        )}
      </div>
    );
  }

  const px = SIZE_PX[size];
  // Wrap both modes in a fixed-size square box so an image and an emoji at
  // the same `size` prop render at the same visual area. Image is inset to
  // ~78% of the box (matching emoji glyph proportion) so neither mode looks
  // bigger than the other.
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: px, height: px }}
      aria-label={iconUrl ? alt || undefined : undefined}
    >
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt={alt}
          className="block object-contain"
          style={{ width: "98%", height: "98%" }}
        />
      ) : (
        <span
          className={`leading-none ${TEXT_SIZE_CLASS[size]}`}
          aria-label={alt || undefined}
          role={alt ? "img" : undefined}
        >
          {emoji ?? "🏆"}
        </span>
      )}
    </span>
  );
}
