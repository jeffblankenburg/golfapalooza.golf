// Standard Golfapalooza hole-score notation: a circle for under par (single =
// birdie, double = eagle or better), a square for over par (single = bogey,
// double = double bogey or worse), plain number for par, and a dot for an
// unscored hole. Green marks under par, dark marks over. One shared source of
// truth used by the live scorers and the read-only live scoreboard so the
// notation matches everywhere.
//
// Rendered as SVG so the number is centered in its shape by geometry
// (text-anchor + dominant-baseline) instead of fighting CSS font-baseline
// metrics. `size` is the outer glyph size in px; single marks are drawn 2px
// smaller. Default 16 matches the dense scorecard inside the live scorers.

const GREEN_STROKE = "#16a34a"; // green-600
const GREEN_TEXT = "#15803d"; // green-700
const DARK = "#111827"; // gray-900
const EMPTY = "#d1d5db"; // gray-300

export function ScoreMark({
  score,
  par,
  size = 16,
}: {
  score: number | undefined;
  par: number;
  size?: number;
}) {
  const c = size / 2;
  const fontSize = size * 0.58;

  // Unscored hole — a small centered dot.
  if (score == null) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block mx-auto">
        <circle cx={c} cy={c} r={size * 0.06} fill={EMPTY} />
      </svg>
    );
  }

  const diff = score - par;
  const round = diff < 0;
  const stroke = round ? GREEN_STROKE : DARK;
  const textFill = round ? GREEN_TEXT : DARK;
  const double = diff <= -2 || diff >= 2;
  const isPar = diff === 0;

  const num = (
    <text
      x={c}
      y={c}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={fontSize}
      fontWeight={700}
      fill={textFill}
    >
      {score}
    </text>
  );

  // Par — number only, no shape.
  if (isPar) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block mx-auto">
        {num}
      </svg>
    );
  }

  // Outer shape fills the box (double marks) or insets 1.5px (single marks).
  const outerInset = double ? 0.5 : 1.5;
  const outer = round ? (
    <circle cx={c} cy={c} r={c - outerInset} fill="none" stroke={stroke} strokeWidth={1} />
  ) : (
    <rect
      x={outerInset}
      y={outerInset}
      width={size - outerInset * 2}
      height={size - outerInset * 2}
      rx={2}
      fill="none"
      stroke={stroke}
      strokeWidth={1}
    />
  );

  const inner = double
    ? round
      ? <circle cx={c} cy={c} r={c - 2.5} fill="none" stroke={stroke} strokeWidth={1} />
      : (
        <rect
          x={2.5}
          y={2.5}
          width={size - 5}
          height={size - 5}
          rx={1.5}
          fill="none"
          stroke={stroke}
          strokeWidth={1}
        />
      )
    : null;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block mx-auto">
      {outer}
      {inner}
      {num}
    </svg>
  );
}
