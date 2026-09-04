import { Hono } from "hono";
import { cors } from "hono/cors";
import type { CreateTableResponse } from "@texas/shared";
import { PokerTable } from "./durable-objects/PokerTable";
import type { Env } from "./env";

export { PokerTable };

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.post("/api/tables", (c) => {
  const tableId = crypto.randomUUID().slice(0, 8);
  return c.json({ tableId } satisfies CreateTableResponse);
});

function tableObject(c: { env: Env; req: { param: (name: "tableId") => string; raw: Request } }) {
  const tableId = c.req.param("tableId");
  return c.env.POKER_TABLE.get(c.env.POKER_TABLE.idFromName(tableId));
}

app.all("/api/tables/:tableId", (c) => tableObject(c).fetch(c.req.raw));

app.all("/api/tables/:tableId/*", (c) => tableObject(c).fetch(c.req.raw));

app.get("/ws/tables/:tableId", (c) => {
  const tableId = c.req.param("tableId");
  const objectUrl = new URL(c.req.url);
  objectUrl.pathname = `/api/tables/${tableId}/ws`;
  return tableObject(c).fetch(new Request(objectUrl, c.req.raw));
});

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
