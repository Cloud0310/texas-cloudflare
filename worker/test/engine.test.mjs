import assert from "node:assert/strict";
import test from "node:test";

import { addPlayer, applyAction, createTable, publicState, startHand } from "../src/poker/engine.ts";

function cardNames(cards) {
  return cards.map((card) => `${card.rank}${card.suit[0]}`);
}

function startedTable() {
  const originalRandom = Math.random;
  Math.random = () => 0.9999999999999999;
  try {
    const table = createTable("table");
    const players = [addPlayer(table, "A"), addPlayer(table, "B"), addPlayer(table, "C")];
    startHand(table);
    return { table, players };
  } finally {
    Math.random = originalRandom;
  }
}

test("deals and plays clockwise from the dealer", () => {
  const { table, players } = startedTable();

  assert.deepEqual(players.map((player) => cardNames(player.cards)), [
    ["4c", "7c"],
    ["2c", "5c"],
    ["3c", "6c"],
  ]);
  assert.equal(table.currentPlayerId, players[0].id);

  applyAction(table, players[0].id, { type: "call" });
  assert.equal(table.currentPlayerId, players[1].id);
  applyAction(table, players[1].id, { type: "call" });
  assert.equal(table.currentPlayerId, players[2].id);
  applyAction(table, players[2].id, { type: "check" });
  assert.equal(table.currentPlayerId, players[1].id);
});

test("only reveals cards from players still in the hand", () => {
  const { table, players } = startedTable();
  players[1].folded = true;
  table.phase = "complete";

  const observerState = publicState(table, players[0].id);
  assert.deepEqual(observerState.players[0].cards, players[0].cards);
  assert.deepEqual(observerState.players[1].cards, [null, null]);
  assert.deepEqual(observerState.players[2].cards, players[2].cards);
  assert.deepEqual(publicState(table, players[1].id).players[1].cards, players[1].cards);
});
