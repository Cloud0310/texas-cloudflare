import {
  TABLE_STATE_VERSION,
  type Card,
  type Player,
  type PlayerAction,
  type TableState,
  type Winner,
} from "@texas/shared";
import { draw, createDeck, shuffle } from "./deck";
import { evaluateHand } from "./evaluator";

const startingChips = 1_000;
const smallBlind = 5;
const bigBlind = 10;
export const DISCONNECT_TIMEOUT_MS = 30_000;

export type InternalTable = Omit<TableState, "players"> & {
  players: Player[];
  deck: Card[];
  actedPlayerIds: string[];
  actedPlayerBets: Record<string, number>;
  disconnectDeadlines: Record<string, number>;
};

export function createTable(id: string): InternalTable {
  return {
    id,
    stateVersion: TABLE_STATE_VERSION,
    updatedAt: Date.now(),
    players: [],
    deck: [],
    actedPlayerIds: [],
    actedPlayerBets: {},
    disconnectDeadlines: {},
    community: [],
    pot: 0,
    phase: "waiting",
    showdown: false,
    dealerIndex: -1,
    currentPlayerId: null,
    minBet: bigBlind,
    callAmount: 0,
    canRaise: false,
    winners: [],
    message: "Waiting for players",
    handNumber: 0,
  };
}

export function freshStoredTable(
  stored: InternalTable | undefined,
  fallbackId: string,
): InternalTable {
  if (stored?.stateVersion === TABLE_STATE_VERSION)
    return { ...stored, disconnectDeadlines: stored.disconnectDeadlines ?? {} };
  return createTable(stored?.id ?? fallbackId);
}

export function addPlayer(table: InternalTable, name: string): Player {
  expireDisconnectedPlayers(table);
  if (table.phase !== "waiting" && table.phase !== "complete")
    throw new Error("Wait for the next hand to join");
  for (const player of table.players.filter(
    (player) => !player.connected && table.disconnectDeadlines[player.id] === undefined,
  ))
    removePlayer(table, player);
  if (table.players.length >= 6) throw new Error("Table is full");

  const player: Player = {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 20) || "Player",
    buyIns: 1,
    chips: startingChips,
    bet: 0,
    totalBet: 0,
    folded: false,
    allIn: false,
    dealer: false,
    smallBlind: false,
    bigBlind: false,
    connected: true,
    cards: [],
  };
  table.players.push(player);
  return player;
}

export function disconnectPlayer(table: InternalTable, playerId: string, now = Date.now()): void {
  const player = table.players.find((candidate) => candidate.id === playerId);
  if (!player || !player.connected) return;

  player.connected = false;
  table.disconnectDeadlines[playerId] = now + DISCONNECT_TIMEOUT_MS;
}

export function reconnectPlayer(table: InternalTable, playerId: string, now = Date.now()): void {
  // A delayed alarm must not let a connection arriving after the deadline
  // recover a hand that has already timed out.
  expireDisconnectedPlayers(table, now);
  const player = table.players.find((candidate) => candidate.id === playerId);
  if (!player) return;
  player.connected = true;
  delete table.disconnectDeadlines[playerId];
}

export function expireDisconnectedPlayers(table: InternalTable, now = Date.now()): boolean {
  const expired = Object.entries(table.disconnectDeadlines)
    .filter(([, deadline]) => deadline <= now)
    .sort((a, b) => a[1] - b[1]);
  for (const [playerId] of expired) {
    delete table.disconnectDeadlines[playerId];
    const player = table.players.find((candidate) => candidate.id === playerId);
    if (player && !player.connected) expireDisconnectedPlayer(table, player);
  }
  return expired.length > 0;
}

function expireDisconnectedPlayer(table: InternalTable, player: Player): void {
  if (table.phase === "waiting" || table.phase === "complete") {
    removePlayer(table, player);
    return;
  }
  if (player.folded || player.allIn) return;

  player.folded = true;
  if (table.currentPlayerId === player.id) finishAction(table, player);
  else maybeCompleteByFolds(table);
}

export function startHand(table: InternalTable): void {
  expireDisconnectedPlayers(table);
  if (table.phase !== "waiting" && table.phase !== "complete")
    throw new Error("Finish the current hand before starting another");
  if (Object.keys(table.disconnectDeadlines).length > 0)
    throw new Error("Waiting for disconnected players to reconnect (up to 30 seconds)");
  for (const player of table.players.filter((player) => !player.connected))
    removePlayer(table, player);
  if (table.players.length < 2) throw new Error("Need at least two players");

  const boughtInPlayers = table.players.filter((player) => player.chips <= 0);
  for (const player of boughtInPlayers) {
    player.chips = startingChips;
    player.buyIns += 1;
  }

  table.handNumber += 1;
  table.deck = shuffle(createDeck());
  table.community = [];
  table.pot = 0;
  table.phase = "preflop";
  table.showdown = false;
  table.winners = [];
  table.actedPlayerIds = [];
  table.actedPlayerBets = {};
  table.dealerIndex = nextSeatedIndex(table, table.dealerIndex);
  table.minBet = bigBlind;

  for (const [index, player] of table.players.entries()) {
    player.cards = [];
    player.bet = 0;
    player.totalBet = 0;
    player.folded = false;
    player.allIn = false;
    player.dealer = index === table.dealerIndex;
    player.smallBlind = false;
    player.bigBlind = false;
  }

  let dealIndex = table.dealerIndex;
  for (let card = 0; card < table.players.length * 2; card += 1) {
    dealIndex = nextSeatedIndex(table, dealIndex);
    table.players[dealIndex].cards.push(...draw(table.deck, 1));
  }

  const headsUp = table.players.length === 2;
  const smallIndex = headsUp ? table.dealerIndex : nextSeatedIndex(table, table.dealerIndex);
  const bigIndex = nextSeatedIndex(table, smallIndex);
  postBlind(table.players[smallIndex], smallBlind);
  postBlind(table.players[bigIndex], bigBlind);
  table.players[smallIndex].smallBlind = true;
  table.players[bigIndex].bigBlind = true;
  table.currentPlayerId = table.players[nextActiveIndex(table, bigIndex)]?.id ?? null;
  table.canRaise = Boolean(table.currentPlayerId);
  table.callAmount = callAmount(table);
  const buyInMessage = boughtInPlayers.length
    ? ` ${boughtInPlayers.map((player) => player.name).join(", ")} bought back in.`
    : "";
  table.message = `Hand ${table.handNumber}: preflop betting.${buyInMessage}`;
  if (!table.currentPlayerId) runOutBoard(table);
}

export function applyAction(table: InternalTable, playerId: string, action: PlayerAction): void {
  if (!action || typeof action !== "object") throw new Error("Invalid action");
  const player = table.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error("Unknown player");
  if (table.currentPlayerId !== playerId) throw new Error("It is not your turn");
  if (player.folded) throw new Error("Folded players cannot act");

  const tableBet = currentBet(table);
  const toCall = Math.max(0, tableBet - player.bet);
  if (player.allIn || player.chips <= 0) throw new Error("All-in players cannot act");

  if (action.type === "fold") {
    player.folded = true;
  } else if (action.type === "check") {
    if (toCall > 0) throw new Error("Cannot check while facing a bet");
  } else if (action.type === "call") {
    if (toCall <= 0) throw new Error("Nothing to call");
    moveChips(player, toCall);
  } else if (action.type === "bet") {
    validateChipAmount(action.amount);
    if (tableBet > 0) throw new Error("Use raise after a bet exists");
    if (action.amount > player.chips) throw new Error("Bet cannot exceed your stack");
    const committed = committedAmount(player, action.amount);
    if (committed < bigBlind && committed < player.chips)
      throw new Error("Bet must be at least the big blind");
    moveChips(player, action.amount);
    if (committed >= bigBlind) {
      table.minBet = committed;
      table.actedPlayerIds = [];
      table.actedPlayerBets = {};
    }
  } else if (action.type === "raise") {
    validateChipAmount(action.amount);
    if (!canPlayerRaise(table, player))
      throw new Error("Betting was not reopened by the short all-in raises");
    if (tableBet <= 0) throw new Error("Use bet when no bet exists");
    const targetBet = action.amount;
    const committed = targetBet - player.bet;
    const raiseBy = targetBet - tableBet;
    if (committed <= 0) throw new Error("Raise must add chips");
    if (committed > player.chips) throw new Error("Raise cannot exceed your stack");
    if (targetBet <= tableBet) throw new Error("Raise must exceed the current bet");
    if (raiseBy < table.minBet && committed < player.chips)
      throw new Error(`Raise must increase by at least ${table.minBet}`);
    moveChips(player, committed);
    if (raiseBy >= table.minBet) {
      table.minBet = raiseBy;
      table.actedPlayerIds = [];
      table.actedPlayerBets = {};
    }
  } else throw new Error("Invalid action");

  finishAction(table, player);
}

function finishAction(table: InternalTable, player: Player): void {
  table.actedPlayerIds.push(player.id);
  table.actedPlayerBets[player.id] = currentBet(table);
  if (maybeCompleteByFolds(table)) return;
  if (bettingRoundComplete(table)) {
    if (shouldRunOutBoard(table)) runOutBoard(table);
    else advanceStreet(table);
  } else
    table.currentPlayerId =
      table.players[nextActiveIndex(table, table.players.indexOf(player))]?.id ?? null;

  table.canRaise = canCurrentPlayerRaise(table);
  table.callAmount = callAmount(table);
}

export function publicState(table: InternalTable, viewerId: string | null): TableState {
  const reveal = table.phase === "complete" && table.showdown;
  const {
    deck: _deck,
    actedPlayerIds: _actedPlayerIds,
    actedPlayerBets: _actedPlayerBets,
    disconnectDeadlines: _disconnectDeadlines,
    ...state
  } = table;
  return {
    ...state,
    canRaise: canCurrentPlayerRaise(table),
    players: state.players.map((player) => ({
      ...player,
      cards:
        player.id === viewerId || (reveal && !player.folded)
          ? player.cards
          : player.cards.map(() => null),
    })),
  };
}

function advanceStreet(table: InternalTable): void {
  collectBets(table);
  table.actedPlayerIds = [];
  table.actedPlayerBets = {};

  if (!dealNextStreet(table)) {
    showdown(table);
    return;
  }

  table.minBet = bigBlind;
  table.currentPlayerId = table.players[nextActiveIndex(table, table.dealerIndex)]?.id ?? null;
  table.canRaise = Boolean(table.currentPlayerId);
  table.callAmount = 0;
  table.message = `${table.phase} betting`;
  if (!table.currentPlayerId) advanceStreet(table);
}

function runOutBoard(table: InternalTable): void {
  collectBets(table);
  table.actedPlayerIds = [];
  table.actedPlayerBets = {};

  while (dealNextStreet(table)) {
    // Deal all remaining public cards before showdown once betting is closed.
  }

  showdown(table);
}

function dealNextStreet(table: InternalTable): boolean {
  if (table.phase === "preflop") {
    table.phase = "flop";
    table.community.push(...draw(table.deck, 3));
    return true;
  }
  if (table.phase === "flop") {
    table.phase = "turn";
    table.community.push(...draw(table.deck, 1));
    return true;
  }
  if (table.phase === "turn") {
    table.phase = "river";
    table.community.push(...draw(table.deck, 1));
    return true;
  }
  return false;
}

function showdown(table: InternalTable): void {
  collectBets(table);
  const activePlayers = table.players.filter((player) => !player.folded);
  const scored = activePlayers.map((player) => ({
    player,
    score: evaluateHand([...player.cards, ...table.community]),
  }));
  const payouts = new Map<string, Winner>();

  for (const pot of sidePots(table)) {
    if (pot.contributorPlayerIds.length === 1) {
      const refund = table.players.find((player) => player.id === pot.contributorPlayerIds[0]);
      if (refund) refund.chips += pot.amount;
      continue;
    }

    const eligible = scored.filter((entry) => pot.eligiblePlayerIds.includes(entry.player.id));
    if (!eligible.length) continue;

    const best = Math.max(...eligible.map((entry) => entry.score.value));
    const winners = eligible.filter((entry) => entry.score.value === best);
    distributePot(table, payouts, winners, pot.amount);
  }

  table.winners = [...payouts.values()];
  table.showdown = true;
  table.phase = "complete";
  table.currentPlayerId = null;
  table.callAmount = 0;
  table.message = table.winners.length
    ? `${table.winners.map((winner) => winner.name).join(", ")} won with ${table.winners[0].description}`
    : "No winners";
  table.canRaise = false;
}

function maybeCompleteByFolds(table: InternalTable): boolean {
  const remaining = table.players.filter((player) => !player.folded);
  if (remaining.length !== 1) return false;

  collectBets(table);
  const winner = remaining[0];
  winner.chips += table.pot;
  table.winners = [
    {
      playerId: winner.id,
      name: winner.name,
      description: "everyone else folded",
      amount: table.pot,
    },
  ];
  table.showdown = false;
  table.phase = "complete";
  table.currentPlayerId = null;
  table.canRaise = false;
  table.callAmount = 0;
  table.message = `${winner.name} wins after everyone folded`;
  return true;
}

function bettingRoundComplete(table: InternalTable): boolean {
  const active = table.players.filter((player) => !player.folded && !player.allIn);
  const bet = currentBet(table);
  return active.every((player) => player.bet === bet && table.actedPlayerIds.includes(player.id));
}

function shouldRunOutBoard(table: InternalTable): boolean {
  if (!["preflop", "flop", "turn"].includes(table.phase)) return false;
  return (
    table.players.filter((player) => !player.folded && !player.allIn && player.chips > 0).length <=
    1
  );
}

function collectBets(table: InternalTable): void {
  for (const player of table.players) {
    table.pot += player.bet;
    player.totalBet += player.bet;
    player.bet = 0;
  }
}

function postBlind(player: Player, amount: number): void {
  moveChips(player, amount);
}

function moveChips(player: Player, amount: number): void {
  validateChipAmount(amount);
  const committed = Math.min(amount, player.chips);
  player.chips -= committed;
  player.bet += committed;
  if (player.chips === 0) player.allIn = true;
}

function currentBet(table: InternalTable): number {
  return Math.max(
    table.phase === "preflop" ? bigBlind : 0,
    ...table.players.map((player) => player.bet),
  );
}

function callAmount(table: InternalTable): number {
  return Math.max(0, currentBet(table) - (currentPlayer(table)?.bet ?? 0));
}

function committedAmount(player: Player, amount: number): number {
  validateChipAmount(amount);
  return Math.min(amount, player.chips);
}

function validateChipAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Amount must be a positive whole number");
}

function sidePots(table: InternalTable): {
  amount: number;
  contributorPlayerIds: string[];
  eligiblePlayerIds: string[];
}[] {
  const levels = [...new Set(table.players.map((player) => player.totalBet).filter(Boolean))].sort(
    (a, b) => a - b,
  );
  const pots: {
    amount: number;
    contributorPlayerIds: string[];
    eligiblePlayerIds: string[];
  }[] = [];
  let previous = 0;

  for (const level of levels) {
    const contributors = table.players.filter((player) => player.totalBet >= level);
    const amount = (level - previous) * contributors.length;
    const contributorPlayerIds = contributors.map((player) => player.id);
    const eligiblePlayerIds = contributors
      .filter((player) => !player.folded)
      .map((player) => player.id);
    if (amount > 0) pots.push({ amount, contributorPlayerIds, eligiblePlayerIds });
    previous = level;
  }

  return pots;
}

function distributePot(
  table: InternalTable,
  payouts: Map<string, Winner>,
  winners: { player: Player; score: ReturnType<typeof evaluateHand> }[],
  amount: number,
): void {
  const orderedWinners = orderFromLeftOfDealer(table, winners);
  const share = Math.floor(amount / orderedWinners.length);
  let remainder = amount % orderedWinners.length;

  for (const winner of orderedWinners) {
    const payout = share + (remainder > 0 ? 1 : 0);
    remainder -= remainder > 0 ? 1 : 0;
    winner.player.chips += payout;

    const existing = payouts.get(winner.player.id);
    if (existing) existing.amount += payout;
    else
      payouts.set(winner.player.id, {
        playerId: winner.player.id,
        name: winner.player.name,
        description: winner.score.description,
        amount: payout,
      });
  }
}

function orderFromLeftOfDealer<T extends { player: Player }>(
  table: InternalTable,
  entries: T[],
): T[] {
  return [...entries].sort((a, b) => playerOrder(table, a.player) - playerOrder(table, b.player));
}

function playerOrder(table: InternalTable, player: Player): number {
  const index = table.players.indexOf(player);
  return (index - table.dealerIndex - 1 + table.players.length) % table.players.length;
}

function currentPlayer(table: InternalTable): Player | undefined {
  return table.players.find((player) => player.id === table.currentPlayerId);
}

function canCurrentPlayerRaise(table: InternalTable): boolean {
  const player = currentPlayer(table);
  return Boolean(player && canPlayerRaise(table, player));
}

function canPlayerRaise(table: InternalTable, player: Player): boolean {
  const previousBet = table.actedPlayerBets[player.id];
  return previousBet === undefined || currentBet(table) - previousBet >= table.minBet;
}

function removePlayer(table: InternalTable, player: Player): void {
  const index = table.players.indexOf(player);
  if (index < 0) return;
  table.players.splice(index, 1);
  delete table.disconnectDeadlines[player.id];
  if (index <= table.dealerIndex) table.dealerIndex -= 1;
}

function nextSeatedIndex(table: InternalTable, from: number): number {
  return (from + 1 + table.players.length) % table.players.length;
}

function nextActiveIndex(table: InternalTable, from: number): number {
  for (let offset = 1; offset <= table.players.length; offset += 1) {
    const index = (from + offset) % table.players.length;
    const player = table.players[index];
    if (!player.folded && !player.allIn && player.chips > 0) return index;
  }
  return -1;
}
