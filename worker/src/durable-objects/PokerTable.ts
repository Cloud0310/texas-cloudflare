import type { ClientMessage, JoinResponse, ServerMessage } from "@texas/shared";
import { DurableObject } from "cloudflare:workers";
import {
  addPlayer,
  applyAction,
  createTable,
  disconnectPlayer,
  expireDisconnectedPlayers,
  freshStoredTable,
  publicState,
  reconnectPlayer,
  startHand,
  type InternalTable,
} from "../poker/engine";
import type { Env } from "../env";

type Session = {
  playerId: string | null;
  socket: WebSocket;
};

const emptyTableTtlMs = 60 * 60 * 1_000;
const occupiedTableTtlMs = 24 * 60 * 60 * 1_000;

export class PokerTable extends DurableObject<Env> {
  private table: InternalTable;
  private sessions = new Set<Session>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.table = createTable(ctx.id.toString());
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<InternalTable>("table");
      this.table = freshStoredTable(stored, this.table.id);
      if (stored && stored.stateVersion !== this.table.stateVersion)
        await ctx.storage.put("table", this.table);
      await this.scheduleAlarm();
    });
  }

  async alarm(): Promise<void> {
    if (this.cleanupAt(this.table) <= Date.now()) {
      await this.ctx.storage.deleteAll();
      this.table = createTable(this.table.id);
      this.broadcast();
      return;
    }

    if (expireDisconnectedPlayers(this.table)) await this.saveAndBroadcast();
    else await this.scheduleAlarm();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.syncTableCode(url);
    try {
      if (expireDisconnectedPlayers(this.table)) await this.saveAndBroadcast();
      if (url.pathname.endsWith("/ws")) return this.handleWebSocket(request, url);
      if (request.method === "GET")
        return Response.json(publicState(this.table, url.searchParams.get("playerId")));
      if (request.method === "POST" && url.pathname.endsWith("/join"))
        return this.handleJoin(request);
      if (request.method === "POST" && url.pathname.endsWith("/start")) return this.handleStart();
      if (request.method === "POST" && url.pathname.endsWith("/actions"))
        return this.handleAction(request);
      if (request.method === "POST" && url.pathname.endsWith("/next-hand"))
        return this.handleStart();
      return new Response("Not found", { status: 404 });
    } catch (error) {
      return Response.json(
        { message: error instanceof Error ? error.message : "Unknown error" },
        { status: 400 },
      );
    }
  }

  private handleWebSocket(request: Request, url: URL): Response {
    if (request.headers.get("Upgrade") !== "websocket")
      return new Response("Expected websocket", { status: 426 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const session: Session = { playerId: url.searchParams.get("playerId"), socket: server };
    const player = this.table.players.find((candidate) => candidate.id === session.playerId);
    const presenceChanged = Boolean(player && !player.connected);
    if (player) reconnectPlayer(this.table, player.id);

    server.accept();
    this.sessions.add(session);
    this.send(session, { type: "hello", tableId: this.table.id, playerId: session.playerId });
    this.sendSnapshot(session);
    if (presenceChanged) this.ctx.waitUntil(this.saveAndBroadcast());

    server.addEventListener("message", (event) => this.handleSocketMessage(session, event));
    server.addEventListener("close", () => this.closeSession(session));
    server.addEventListener("error", () => this.closeSession(session));

    return new Response(null, { status: 101, webSocket: client });
  }

  private syncTableCode(url: URL): void {
    const tableId = url.pathname.match(/\/api\/tables\/([^/]+)/)?.[1];
    if (tableId && this.table.id !== tableId) this.table.id = tableId;
  }

  private async handleJoin(request: Request): Promise<Response> {
    const body = await request.json<{ name?: string }>();
    const player = addPlayer(this.table, body.name ?? "Player");
    await this.saveAndBroadcast();
    return Response.json({
      tableId: this.table.id,
      playerId: player.id,
      state: publicState(this.table, player.id),
    } satisfies JoinResponse);
  }

  private async handleStart(): Promise<Response> {
    startHand(this.table);
    await this.saveAndBroadcast();
    return Response.json(publicState(this.table, null));
  }

  private async handleAction(request: Request): Promise<Response> {
    const body = await request.json<
      Extract<ClientMessage, { type: "action" }> & { playerId?: string }
    >();
    if (!body.playerId) throw new Error("Missing player id");
    applyAction(this.table, body.playerId, body.action);
    await this.saveAndBroadcast();
    return Response.json(publicState(this.table, body.playerId));
  }

  private async handleSocketMessage(session: Session, event: MessageEvent): Promise<void> {
    try {
      if (expireDisconnectedPlayers(this.table)) await this.saveAndBroadcast();
      const message = JSON.parse(String(event.data)) as ClientMessage;
      if (message.type === "join") {
        const player = addPlayer(this.table, message.name);
        session.playerId = player.id;
        await this.saveAndBroadcast();
        this.send(session, {
          type: "joined",
          playerId: player.id,
          state: publicState(this.table, player.id),
        });
      } else if (message.type === "start" || message.type === "nextHand") {
        startHand(this.table);
        await this.saveAndBroadcast();
      } else if (message.type === "action") {
        if (!session.playerId) throw new Error("Join before acting");
        applyAction(this.table, session.playerId, message.action);
        await this.saveAndBroadcast();
      }
    } catch (error) {
      this.send(session, {
        type: "error",
        message: error instanceof Error ? error.message : "Invalid message",
      });
    }
  }

  private closeSession(session: Session): void {
    if (!this.sessions.delete(session)) return;
    const player = this.table.players.find((candidate) => candidate.id === session.playerId);
    const hasActiveSession = [...this.sessions].some(
      (candidate) => candidate.playerId === session.playerId,
    );
    if (player && !hasActiveSession) {
      disconnectPlayer(this.table, player.id);
      this.ctx.waitUntil(this.saveAndBroadcast());
    }
  }

  private async saveAndBroadcast(): Promise<void> {
    this.table.updatedAt = Date.now();
    await this.ctx.storage.put("table", this.table);
    await this.scheduleAlarm();
    this.broadcast();
  }

  private async scheduleAlarm(): Promise<void> {
    // Durable Objects have one alarm: wake for the next disconnect deadline
    // or table cleanup, whichever comes first.
    await this.ctx.storage.setAlarm(
      Math.min(this.cleanupAt(this.table), ...Object.values(this.table.disconnectDeadlines)),
    );
  }

  private cleanupAt(table: InternalTable): number {
    const ttl = table.players.some((player) => player.connected)
      ? occupiedTableTtlMs
      : emptyTableTtlMs;
    return table.updatedAt + ttl;
  }

  private broadcast(): void {
    for (const session of this.sessions) this.sendSnapshot(session);
  }

  private sendSnapshot(session: Session): void {
    this.send(session, {
      type: "snapshot",
      state: publicState(this.table, session.playerId),
      playerId: session.playerId,
    });
  }

  private send(session: Session, message: ServerMessage): void {
    try {
      session.socket.send(JSON.stringify(message));
    } catch {
      this.closeSession(session);
    }
  }
}
