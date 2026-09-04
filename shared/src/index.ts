export type Suit = "clubs" | "diamonds" | "hearts" | "spades";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";

export const TABLE_STATE_VERSION = 4;

export type Card = {
  rank: Rank;
  suit: Suit;
};

export type GamePhase = "waiting" | "preflop" | "flop" | "turn" | "river" | "complete";

export type Player = {
  id: string;
  name: string;
  buyIns: number;
  chips: number;
  bet: number;
  totalBet: number;
  folded: boolean;
  allIn: boolean;
  dealer: boolean;
  smallBlind: boolean;
  bigBlind: boolean;
  connected: boolean;
  cards: Card[];
};

export type PublicPlayer = Omit<Player, "cards"> & {
  cards: (Card | null)[];
};

export type Winner = {
  playerId: string;
  name: string;
  description: string;
  amount: number;
};

export type TableState = {
  stateVersion: number;
  updatedAt: number;
  id: string;
  players: PublicPlayer[];
  community: Card[];
  pot: number;
  phase: GamePhase;
  dealerIndex: number;
  currentPlayerId: string | null;
  minBet: number;
  callAmount: number;
  winners: Winner[];
  message: string;
  handNumber: number;
};

export type PlayerAction =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "bet"; amount: number }
  | { type: "raise"; amount: number };

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "action"; action: PlayerAction }
  | { type: "nextHand" };

export type ServerMessage =
  | { type: "hello"; tableId: string; playerId: string | null }
  | { type: "snapshot"; state: TableState; playerId: string | null }
  | { type: "joined"; playerId: string; state: TableState }
  | { type: "error"; message: string };

export type JoinResponse = {
  tableId: string;
  playerId: string;
  state: TableState;
};

export type CreateTableResponse = {
  tableId: string;
};

export function livePot(state: Pick<TableState, "players" | "pot">): number {
  return state.pot + state.players.reduce((sum, player) => sum + player.bet, 0);
}

export function heroForState(
  state: Pick<TableState, "players">,
  playerId: string,
): PublicPlayer | undefined {
  return state.players.find((player) => player.id === playerId);
}

export function currentStreetBet(
  state: Pick<TableState, "callAmount">,
  hero?: Pick<PublicPlayer, "bet">,
): number {
  return (hero?.bet ?? 0) + state.callAmount;
}

export function clampAmount(amount: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, amount));
}
