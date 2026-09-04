import type { PokerTable } from "./durable-objects/PokerTable";

export type Env = {
  ASSETS: Fetcher;
  POKER_TABLE: DurableObjectNamespace<PokerTable>;
};
