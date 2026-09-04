import type { Card } from "@texas/shared";

const rankValue = new Map([
  ["2", 2],
  ["3", 3],
  ["4", 4],
  ["5", 5],
  ["6", 6],
  ["7", 7],
  ["8", 8],
  ["9", 9],
  ["T", 10],
  ["J", 11],
  ["Q", 12],
  ["K", 13],
  ["A", 14],
]);

type Score = {
  value: number;
  description: string;
};

export function evaluateHand(cards: Card[]): Score {
  const values = cards.map((card) => rankValue.get(card.rank) ?? 0).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  const suits = new Map<string, Card[]>();

  for (const card of cards) {
    const value = rankValue.get(card.rank) ?? 0;
    counts.set(value, (counts.get(value) ?? 0) + 1);
    suits.set(card.suit, [...(suits.get(card.suit) ?? []), card]);
  }

  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flushCards = [...suits.values()].find((group) => group.length >= 5);
  const straightHigh = getStraightHigh(values);
  const flushHigh = flushCards
    ? Math.max(...flushCards.map((card) => rankValue.get(card.rank) ?? 0))
    : 0;
  const straightFlushHigh = flushCards
    ? getStraightHigh(flushCards.map((card) => rankValue.get(card.rank) ?? 0))
    : 0;

  if (straightFlushHigh)
    return { value: 8_000_000 + straightFlushHigh, description: "straight flush" };
  if (groups[0]?.[1] === 4)
    return {
      value: 7_000_000 + groups[0][0] * 100 + kicker(groups, [groups[0][0]]),
      description: "four of a kind",
    };
  if (groups[0]?.[1] === 3 && groups[1]?.[1] >= 2)
    return { value: 6_000_000 + groups[0][0] * 100 + groups[1][0], description: "full house" };
  if (flushHigh)
    return {
      value:
        5_000_000 + encodeHighCards(flushCards?.map((card) => rankValue.get(card.rank) ?? 0) ?? []),
      description: "flush",
    };
  if (straightHigh) return { value: 4_000_000 + straightHigh, description: "straight" };
  if (groups[0]?.[1] === 3)
    return {
      value: 3_000_000 + groups[0][0] * 10_000 + encodeKickers(groups, [groups[0][0]], 2),
      description: "three of a kind",
    };
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2)
    return {
      value:
        2_000_000 +
        groups[0][0] * 10_000 +
        groups[1][0] * 100 +
        kicker(groups, [groups[0][0], groups[1][0]]),
      description: "two pair",
    };
  if (groups[0]?.[1] === 2)
    return {
      value: 1_000_000 + groups[0][0] * 10_000 + encodeKickers(groups, [groups[0][0]], 3),
      description: "one pair",
    };

  return { value: encodeHighCards(values), description: "high card" };
}

function getStraightHigh(values: number[]): number {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  for (let i = 0; i <= unique.length - 5; i += 1) {
    const run = unique.slice(i, i + 5);
    if (run[0] - run[4] === 4) return run[0];
  }
  return 0;
}

function encodeHighCards(values: number[]): number {
  return [...new Set(values)]
    .sort((a, b) => b - a)
    .slice(0, 5)
    .reduce((score, value) => score * 15 + value, 0);
}

function encodeKickers(groups: [number, number][], excluded: number[], count: number): number {
  return groups
    .filter(([value]) => !excluded.includes(value))
    .map(([value]) => value)
    .sort((a, b) => b - a)
    .slice(0, count)
    .reduce((score, value) => score * 15 + value, 0);
}

function kicker(groups: [number, number][], excluded: number[]): number {
  return (
    groups.filter(([value]) => !excluded.includes(value)).sort((a, b) => b[0] - a[0])[0]?.[0] ?? 0
  );
}
