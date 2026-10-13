/**
 * Plain-language rules for every per-round side game (#222), shown in-app via the
 * circle-i rules modal wherever a game appears (setup, live scorer, add/settings
 * modals). Keep these in sync with the compute libs: skins.ts, chairman.ts,
 * wolf.ts, nassau.ts, sixes.ts, vegas.ts.
 */

export interface GameRules {
  label: string;
  tagline: string;
  players: string; // short roster note (e.g. "2 or more players")
  sections: { heading: string; points: string[] }[];
}

const NET_NOTE =
  "Net or Raw: Net subtracts each player's handicap strokes per hole before scoring; Raw uses the gross score. You choose when you add the game.";
const MONEY_UNIT = (unit: string) =>
  `If you set a stake, it's paid per ${unit}. Everything settles up peer-to-peer between players; the app never holds money.`;

export const GAME_RULES: Record<string, GameRules> = {
  skins: {
    label: "Skins",
    tagline: "Win a hole outright to take its skin.",
    players: "2 or more players",
    sections: [
      {
        heading: "How it works",
        points: [
          "The low score on a hole wins that hole's skin.",
          "Tie for low and the skin is a push — nobody wins it.",
          "With Carryover on, a tied hole's skin rolls to the next hole, so a later outright winner can sweep several at once.",
        ],
      },
      { heading: "Scoring", points: ["Each hole is worth one skin (plus any carried over)."] },
      { heading: "Options", points: [NET_NOTE, MONEY_UNIT("skin")] },
    ],
  },

  chairman: {
    label: "Chairman",
    tagline: "King of the hill — hold the chair and defend it.",
    players: "2 or more players",
    sections: [
      {
        heading: "Taking the chair",
        points: [
          "The first player to win a hole outright (unique low, no tie) becomes the Chairman.",
          "No point is awarded for taking the chair — only for defending it.",
        ],
      },
      {
        heading: "Holding the chair",
        points: [
          "Chairman wins a hole outright → +1 point, and keeps the chair.",
          "A different player wins a hole outright → they become the new Chairman, no point.",
          "Any tie for low → no point, and the chair doesn't change (this covers the Chairman tying, too).",
        ],
      },
      { heading: "Scoring", points: ["Points are worth a per-point value (default $5).", NET_NOTE, MONEY_UNIT("point")] },
    ],
  },

  wolf: {
    label: "Wolf",
    tagline: "Rotating foursome — the Wolf picks a partner or goes it alone.",
    players: "Exactly 4 players",
    sections: [
      {
        heading: "Who's the Wolf",
        points: [
          "One player is the Wolf each hole, rotating in tee order.",
          "On holes 17 and 18, the player in last place is the Wolf.",
        ],
      },
      {
        heading: "The pick",
        points: [
          "After the tee shots, the Wolf either picks a partner (2 vs 2, best ball) or goes Lone Wolf (1 vs 3) for a bigger reward.",
          "Make the pick on the scorer at the current hole — score entry is held until the pick is in (you can bypass it).",
        ],
      },
      {
        heading: "Deciding the hole",
        points: [
          "Each side counts only its best ball (its single lowest score); the lower best ball wins the hole.",
          "If the best balls tie, the Tied-best-ball setting decides: Push (dead hole — the default), Other ball (lower second ball wins), or Total (lower two-ball total wins).",
          "A Lone Wolf has only one ball, so its ties always push.",
        ],
      },
      {
        heading: "Scoring (points are zero-sum)",
        points: [
          "Partner hole (×1): the winning side each +1, the losing side each −1; tie pushes.",
          "Lone Wolf (×2): win beats all three for +6 (each opponent −2); lose is −6 (each opponent +2); tie pushes.",
        ],
      },
      { heading: "Options", points: ["Points carry a per-point value (default $1).", NET_NOTE, MONEY_UNIT("point")] },
    ],
  },

  nassau: {
    label: "Nassau",
    tagline: "Three match-play bets in one round.",
    players: "2 players (head to head)",
    sections: [
      {
        heading: "How it works",
        points: [
          "Three separate bets: the Front 9, the Back 9, and the Total 18.",
          "Within each, low score wins the hole and ties halve; most holes won takes that bet.",
        ],
      },
      {
        heading: "Match play terms",
        points: [
          "A bet closes out once a lead is bigger than the holes left (e.g. 4&3) — later holes don't count.",
          "Dormie means the leader is up by exactly the holes remaining, so they can't lose.",
        ],
      },
      { heading: "Options", points: [NET_NOTE, MONEY_UNIT("bet")] },
    ],
  },

  sixes: {
    label: "6-6-6",
    tagline: "Foursome best-ball with rotating partners.",
    players: "Exactly 4 players",
    sections: [
      {
        heading: "How it works",
        points: [
          "Partners rotate every six holes, so you team with each other player for one six-hole match.",
          "Each segment is a 2 vs 2 best-ball match: low ball wins the hole, most holes wins the segment.",
        ],
      },
      { heading: "Options", points: [NET_NOTE, MONEY_UNIT("segment")] },
    ],
  },

  vegas: {
    label: "Vegas",
    tagline: "Two teams of two — combine your scores into one number.",
    players: "Exactly 4 players (two teams)",
    sections: [
      {
        heading: "How it works",
        points: [
          "Each team's two scores combine into a two-digit number, low score first (a 4 and a 6 make 46).",
          "The low team number wins the difference between the two teams' numbers in points.",
        ],
      },
      {
        heading: "The flip",
        points: ["A birdie (or better) by the opposing team flips your number high-digit-first (46 becomes 64) — big swings."],
      },
      { heading: "Options", points: [NET_NOTE, MONEY_UNIT("point")] },
    ],
  },
};
