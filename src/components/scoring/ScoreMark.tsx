// Standard Golfapalooza hole-score notation: a circle for under par (single =
// birdie, double = eagle or better), a square for over par (single = bogey,
// double = double bogey or worse), plain number for par, and a dot for an
// unscored hole. Green marks under par, dark marks over. One shared source of
// truth used by the live scorers and the read-only live scoreboard so the
// notation matches everywhere.
//
// `size` is the outer glyph size in px for the double marks; single marks are
// 2px smaller. Text scales with it. Default 16 reproduces the dense scorecard
// used inside the live scorers exactly.
export function ScoreMark({
  score,
  par,
  size = 16,
}: {
  score: number | undefined;
  par: number;
  size?: number;
}) {
  if (score == null) {
    return (
      <span className="text-gray-300" style={{ fontSize: size * 0.625 }}>
        ·
      </span>
    );
  }

  const diff = score - par;
  const markFont = size * 0.5625;
  const single = size - 2;

  // Eagle or better — double circle.
  if (diff <= -2) {
    return (
      <div
        className="relative flex items-center justify-center mx-auto"
        style={{ width: size, height: size }}
      >
        <div className="absolute inset-0 rounded-full border border-green-600" />
        <div className="absolute rounded-full border border-green-600" style={{ inset: 2 }} />
        <span className="relative z-10 font-bold text-green-700" style={{ fontSize: markFont }}>
          {score}
        </span>
      </div>
    );
  }

  // Birdie — single circle.
  if (diff === -1) {
    return (
      <div
        className="relative flex items-center justify-center mx-auto"
        style={{ width: single, height: single }}
      >
        <div className="absolute inset-0 rounded-full border border-green-600" />
        <span className="relative z-10 font-bold text-green-700" style={{ fontSize: markFont }}>
          {score}
        </span>
      </div>
    );
  }

  // Par — plain number.
  if (diff === 0) {
    return (
      <span className="font-bold text-gray-900" style={{ fontSize: size * 0.625 }}>
        {score}
      </span>
    );
  }

  // Bogey — single square.
  if (diff === 1) {
    return (
      <div
        className="relative flex items-center justify-center mx-auto"
        style={{ width: single, height: single }}
      >
        <div className="absolute inset-0 rounded-sm border border-gray-900" />
        <span className="relative z-10 font-bold text-gray-900" style={{ fontSize: markFont }}>
          {score}
        </span>
      </div>
    );
  }

  // Double bogey or worse — double square.
  return (
    <div
      className="relative flex items-center justify-center mx-auto"
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-0 rounded-sm border border-gray-900" />
      <div className="absolute rounded-sm border border-gray-900" style={{ inset: 2 }} />
      <span className="relative z-10 font-bold text-gray-900" style={{ fontSize: markFont }}>
        {score}
      </span>
    </div>
  );
}
