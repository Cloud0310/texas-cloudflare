import assert from "node:assert/strict";
import test from "node:test";

import {
  addPlayer,
  applyAction,
  createTable,
  disconnectPlayer,
  publicState,
  startHand,
} from "../src/poker/engine.ts";
import { evaluateHand } from "../src/poker/evaluator.ts";

function cardNames(cards) {
  return cards.map((card) => `${card.rank}${card.suit[0]}`);
}

const suits = { c: "clubs", d: "diamonds", h: "hearts", s: "spades" };

function cards(...values) {
  return values.map((value) => ({ rank: value[0], suit: suits[value[1]] }));
}

function startedTable(names = ["A", "B", "C"], chips = []) {
  const originalRandom = Math.random;
  Math.random = () => 0.9999999999999999;
  try {
    const table = createTable("table");
    const players = names.map((name) => addPlayer(table, name));
    for (const [index, amount] of chips.entries()) {
      if (amount !== undefined) players[index].chips = amount;
    }
    startHand(table);
    return { table, players };
  } finally {
    Math.random = originalRandom;
  }
}

test("three-handed deals from the small blind and acts left of the big blind", () => {
  const { table, players } = startedTable();

  assert.deepEqual(
    players.map((player) => cardNames(player.cards)),
    [
      ["4c", "7c"],
      ["2c", "5c"],
      ["3c", "6c"],
    ],
  );
  assert.equal(players[0].dealer, true);
  assert.equal(players[1].smallBlind, true);
  assert.equal(players[2].bigBlind, true);
  assert.equal(table.currentPlayerId, players[0].id);

  applyAction(table, players[0].id, { type: "call" });
  assert.equal(table.currentPlayerId, players[1].id);
  applyAction(table, players[1].id, { type: "call" });
  assert.equal(table.currentPlayerId, players[2].id);
  applyAction(table, players[2].id, { type: "check" });
  assert.equal(table.currentPlayerId, players[1].id);
});

test("heads-up deals first to the big blind and the button acts first", () => {
  const { table, players } = startedTable(["A", "B"]);

  assert.deepEqual(
    players.map((player) => cardNames(player.cards)),
    [
      ["3c", "5c"],
      ["2c", "4c"],
    ],
  );
  assert.equal(players[0].dealer, true);
  assert.equal(players[0].smallBlind, true);
  assert.equal(players[1].bigBlind, true);
  assert.equal(table.currentPlayerId, players[0].id);
});

test("only reveals cards from players still in the hand", () => {
  const { table, players } = startedTable();
  players[1].folded = true;
  table.phase = "complete";
  table.showdown = true;

  const observerState = publicState(table, players[0].id);
  assert.deepEqual(observerState.players[0].cards, players[0].cards);
  assert.deepEqual(observerState.players[1].cards, [null, null]);
  assert.deepEqual(observerState.players[2].cards, players[2].cards);
  assert.deepEqual(publicState(table, players[1].id).players[1].cards, players[1].cards);
});

test("does not reveal any hand when everyone else folds", () => {
  const { table, players } = startedTable();

  applyAction(table, players[0].id, { type: "fold" });
  applyAction(table, players[1].id, { type: "fold" });

  assert.equal(table.phase, "complete");
  assert.ok(
    publicState(table, null).players.every((player) => player.cards.every((card) => card === null)),
  );
});

test("uses a full big blind as the preflop bring-in", () => {
  const { table, players } = startedTable(["A", "B", "C"], [undefined, undefined, 3]);

  assert.equal(players[2].bigBlind, true);
  assert.equal(players[2].bet, 3);
  assert.equal(players[2].allIn, true);
  assert.equal(table.callAmount, 10);
});

test("runs the board when every player is all in from the blinds", () => {
  const { table } = startedTable(["A", "B"], [5, 7]);

  assert.equal(table.phase, "complete");
  assert.equal(table.community.length, 5);
  assert.equal(
    table.players.reduce((sum, player) => sum + player.chips, 0),
    12,
  );
});

test("does not reopen raising after a short all-in raise", () => {
  const { table, players } = startedTable(["A", "B", "C", "D"]);
  players[1].chips = 30;

  applyAction(table, players[3].id, { type: "raise", amount: 30 });
  applyAction(table, players[0].id, { type: "call" });
  applyAction(table, players[1].id, { type: "raise", amount: 35 });
  applyAction(table, players[2].id, { type: "call" });

  assert.equal(table.currentPlayerId, players[3].id);
  assert.equal(publicState(table, players[3].id).canRaise, false);
  assert.throws(
    () => applyAction(table, players[3].id, { type: "raise", amount: 55 }),
    /not reopened/,
  );
});

test("reopens raising after cumulative short all-ins make a full raise", () => {
  const { table, players } = startedTable(["A", "B", "C", "D", "E"]);
  players[4].chips = 35;
  players[0].chips = 50;

  applyAction(table, players[3].id, { type: "raise", amount: 30 });
  applyAction(table, players[4].id, { type: "raise", amount: 35 });
  applyAction(table, players[0].id, { type: "raise", amount: 50 });
  applyAction(table, players[1].id, { type: "call" });
  applyAction(table, players[2].id, { type: "call" });

  assert.equal(table.currentPlayerId, players[3].id);
  assert.equal(publicState(table, players[3].id).canRaise, true);
  applyAction(table, players[3].id, { type: "raise", amount: 70 });
});

test("rejects malformed actions and fractional chip amounts", () => {
  {
    const { table } = startedTable();
    const turn = table.currentPlayerId;
    assert.throws(() => applyAction(table, turn, { type: "dance" }), /Invalid action/);
    assert.equal(table.currentPlayerId, turn);
  }

  for (const amount of [20.5, "20"]) {
    const { table } = startedTable();
    assert.throws(
      () => applyAction(table, table.currentPlayerId, { type: "raise", amount }),
      /whole number/,
    );
  }
});

function finishRiver(table, actor) {
  for (const player of table.players) player.bet = 0;
  table.phase = "river";
  table.currentPlayerId = actor.id;
  table.actedPlayerIds = table.players
    .filter((player) => player !== actor && !player.folded && !player.allIn)
    .map((player) => player.id);
  applyAction(table, actor.id, { type: "check" });
}

test("refunds an uncalled overbet without declaring it a win", () => {
  const { table, players } = startedTable(["A", "B"]);
  table.community = cards("Kc", "Qd", "9s", "8h", "7c");
  players[0].cards = cards("2c", "3d");
  players[1].cards = cards("As", "Ad");
  players[0].chips = 900;
  players[1].chips = 950;
  players[0].totalBet = 100;
  players[1].totalBet = 50;
  table.pot = 150;

  finishRiver(table, players[0]);

  assert.deepEqual(
    players.map((player) => player.chips),
    [950, 1_050],
  );
  assert.deepEqual(table.winners, [
    {
      playerId: players[1].id,
      name: players[1].name,
      description: "one pair",
      amount: 100,
    },
  ]);
});

test("awards main and side pots to their eligible winners", () => {
  const { table, players } = startedTable();
  table.community = cards("Qc", "Jd", "9s", "8h", "7c");
  players[0].cards = cards("2c", "3d");
  players[1].cards = cards("As", "Ad");
  players[2].cards = cards("Ks", "Kd");
  for (const [index, totalBet] of [100, 50, 100].entries()) {
    players[index].totalBet = totalBet;
    players[index].chips = 1_000 - totalBet;
  }
  table.pot = 250;

  finishRiver(table, players[0]);

  assert.deepEqual(
    players.map((player) => player.chips),
    [900, 1_100, 1_000],
  );
  assert.deepEqual(
    table.winners.map(({ playerId, amount }) => ({ playerId, amount })),
    [
      { playerId: players[1].id, amount: 150 },
      { playerId: players[2].id, amount: 100 },
    ],
  );
});

test("awards an odd chip to the first tied winner left of the dealer", () => {
  const { table, players } = startedTable();
  table.community = cards("As", "Ks", "Qs", "Js", "Ts");
  players[0].folded = true;
  for (const player of players) {
    player.totalBet = 5;
    player.chips = 995;
  }
  table.pot = 15;

  finishRiver(table, players[1]);

  assert.deepEqual(
    players.map((player) => player.chips),
    [995, 1_003, 1_002],
  );
});

test("ranks every Hold'em hand category in order", () => {
  const hands = [
    cards("As", "Kd", "9c", "7h", "4s", "3d", "2c"),
    cards("As", "Ad", "Kc", "Qh", "9s", "4d", "2c"),
    cards("As", "Ad", "Kc", "Kh", "9s", "4d", "2c"),
    cards("As", "Ad", "Ac", "Kh", "Qs", "4d", "2c"),
    cards("As", "2d", "3c", "4h", "5s", "9d", "Kc"),
    cards("As", "Js", "9s", "7s", "4s", "Kd", "Qc"),
    cards("As", "Ad", "Ac", "Kh", "Ks", "4d", "2c"),
    cards("As", "Ad", "Ac", "Ah", "Ks", "4d", "2c"),
    cards("9s", "Ts", "Js", "Qs", "Ks", "4d", "2c"),
  ].map(evaluateHand);

  assert.deepEqual(
    hands.map((hand) => hand.description),
    [
      "high card",
      "one pair",
      "two pair",
      "three of a kind",
      "straight",
      "flush",
      "full house",
      "four of a kind",
      "straight flush",
    ],
  );
  for (let index = 1; index < hands.length; index += 1) {
    assert.ok(hands[index].value > hands[index - 1].value);
  }
});

test("breaks ties using the best five cards", () => {
  assert.ok(
    evaluateHand(cards("As", "Ad", "Kc", "Qh", "9s", "4d", "2c")).value >
      evaluateHand(cards("Ks", "Kd", "Ac", "Qh", "9s", "4d", "2c")).value,
  );
  assert.ok(
    evaluateHand(cards("2s", "3d", "4c", "5h", "6s", "Kd", "Qc")).value >
      evaluateHand(cards("As", "2d", "3c", "4h", "5s", "Kd", "Qc")).value,
  );
  assert.ok(
    evaluateHand(cards("As", "Ad", "Ac", "Ks", "Kd", "2h", "3c")).value >
      evaluateHand(cards("Ks", "Kd", "Kc", "As", "Ad", "2h", "3c")).value,
  );
});

test("folds a disconnected player and removes the stale seat before the next hand", () => {
  const { table, players } = startedTable();

  disconnectPlayer(table, players[0].id);
  assert.equal(players[0].connected, false);
  assert.equal(players[0].folded, true);
  assert.equal(table.currentPlayerId, players[1].id);

  applyAction(table, players[1].id, { type: "fold" });
  assert.equal(table.phase, "complete");
  addPlayer(table, "D");
  startHand(table);

  assert.deepEqual(
    table.players.map((player) => player.name),
    ["B", "C", "D"],
  );
  assert.equal(table.players[0].dealer, true);
});

test("advances a checked-down heads-up hand through every street", () => {
  const { table, players } = startedTable(["A", "B"]);

  applyAction(table, players[0].id, { type: "call" });
  applyAction(table, players[1].id, { type: "check" });
  assert.equal(table.phase, "flop");
  assert.equal(table.community.length, 3);

  for (const phase of ["turn", "river", "complete"]) {
    applyAction(table, players[1].id, { type: "check" });
    applyAction(table, players[0].id, { type: "check" });
    assert.equal(table.phase, phase);
  }

  assert.equal(table.community.length, 5);
  assert.equal(table.showdown, true);
  assert.equal(table.currentPlayerId, null);
  assert.equal(table.callAmount, 0);
  assert.equal(
    players.reduce((sum, player) => sum + player.chips, 0),
    2_000,
  );
});

test("rotates the dealer and buys in an empty stack for the next hand", () => {
  const { table, players } = startedTable();
  applyAction(table, players[0].id, { type: "fold" });
  applyAction(table, players[1].id, { type: "fold" });
  players[1].chips = 0;

  startHand(table);

  assert.equal(table.dealerIndex, 1);
  assert.equal(players[1].dealer, true);
  assert.equal(players[1].buyIns, 2);
  assert.equal(players[1].chips, 1_000);
});

test("rejects illegal checks and undersized raises without changing the turn", () => {
  const { table } = startedTable();
  const turn = table.currentPlayerId;

  assert.throws(() => applyAction(table, turn, { type: "check" }), /facing a bet/);
  assert.throws(() => applyAction(table, turn, { type: "raise", amount: 15 }), /at least 10/);
  assert.equal(table.currentPlayerId, turn);
});

test("deals every physical card at most once", () => {
  const { table, players } = startedTable(["A", "B", "C", "D", "E", "F"]);
  const dealt = [...table.deck, ...players.flatMap((player) => player.cards)];
  const names = dealt.map((card) => `${card.rank}-${card.suit}`);

  assert.equal(dealt.length, 52);
  assert.equal(new Set(names).size, 52);
});
