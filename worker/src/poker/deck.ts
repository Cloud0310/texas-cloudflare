import type { Card, Rank, Suit } from "@texas/shared";

const suits: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
const ranks: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

export function createDeck(): Card[] {
  return suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit })));
}

export function shuffle(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function draw(deck: Card[], count: number): Card[] {
  return deck.splice(0, count);
}
